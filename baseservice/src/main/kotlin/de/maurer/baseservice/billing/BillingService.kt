package de.maurer.baseservice.billing

import de.maurer.baseservice.domain.BillingInterval
import de.maurer.baseservice.domain.BillingPlan
import de.maurer.baseservice.domain.StammtischSubscriptionEntity
import de.maurer.baseservice.domain.SubscriptionStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.BillingCheckoutRequest
import de.maurer.baseservice.dto.BillingOverviewDto
import de.maurer.baseservice.dto.BillingRedirectDto
import de.maurer.baseservice.dto.PlanLimitsDto
import de.maurer.baseservice.dto.PlanOfferDto
import de.maurer.baseservice.dto.PlanUsageDto
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.PermissionDeniedException
import de.maurer.baseservice.repository.StammtischSubscriptionRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.AuditService
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant
import java.util.UUID

/**
 * Tarif des aktuellen Stammtischs: Übersicht, Buchung über Stripe Checkout,
 * Zahlungsportal und der optionale Förderbeitrag.
 *
 * Die App speichert keine Zahlungsdaten. Den Tarif ändern nur Stripe-Webhooks
 * ([StripeWebhookService]) und die Plattform-Administration ([setPlanManually]).
 */
@Service
class BillingService(
    private val properties: BillingProperties,
    private val stripe: StripeClient,
    private val subscriptionRepository: StammtischSubscriptionRepository,
    private val planLimits: PlanLimits,
    private val tenantTransactions: TenantTransactions,
    private val auditService: AuditService,
    private val clock: Clock = Clock.systemUTC()
) {

    fun overview(principal: UserPrincipal): BillingOverviewDto {
        val stammtischId = TenantContext.requireStammtischId()
        return tenantTransactions.readInStammtisch(stammtischId) {
            val subscription = planLimits.subscription(stammtischId)
            val plan = subscription?.plan ?: BillingPlan.free
            val usage = planLimits.usage()
            BillingOverviewDto(
                plan = plan.name,
                interval = subscription?.billingInterval?.name,
                status = (subscription?.status ?: SubscriptionStatus.none).name,
                readOnly = subscription?.isReadOnly(Instant.now(clock)) == true,
                graceUntil = subscription?.graceUntil,
                currentPeriodEnd = subscription?.currentPeriodEnd,
                limits = limitsDto(plan),
                usage = PlanUsageDto(usage.members, usage.storageBytes, usage.activeKiosks),
                canManage = principal.hasPermission(Permission.BILLING_MANAGE),
                checkoutAvailable = properties.configured,
                supporterAvailable = properties.configured && properties.prices.supporter.isNotBlank(),
                supporterAmountCents = properties.amounts.supporterMonth.takeIf { properties.prices.supporter.isNotBlank() },
                hasPaymentAccount = subscription?.stripeCustomerId != null,
                plans = BillingPlan.entries.map { offer(it) }
            )
        }
    }

    /**
     * Startet die Buchung eines Tarifs. Läuft schon ein Abo, führt der Weg ins
     * Zahlungsportal: dort wechselt man den Tarif, ohne doppelt zu zahlen.
     */
    fun checkout(request: BillingCheckoutRequest, principal: UserPrincipal): BillingRedirectDto {
        requireManage(principal)
        requireStripe()
        val stammtischId = TenantContext.requireStammtischId()
        val plan = BillingPlan.entries.firstOrNull { it.name == request.plan && it != BillingPlan.free }
            ?: throw InvalidRequestException(Msg("error.billing.invalidPlan"), ErrorCode.INVALID_REQUEST)
        val interval = BillingInterval.entries.firstOrNull { it.name == request.interval }
            ?: throw InvalidRequestException(Msg("error.billing.invalidInterval"), ErrorCode.INVALID_REQUEST)
        val subscription = tenantTransactions.readAsSystem { subscriptionRepository.findById(stammtischId).orElse(null) }
        val customerId = subscription?.stripeCustomerId
        if (customerId != null && subscription.stripeSubscriptionId != null &&
            subscription.status in setOf(SubscriptionStatus.active, SubscriptionStatus.past_due)
        ) {
            return BillingRedirectDto(stripe.createPortalSession(customerId, returnUrl()))
        }
        val priceId = priceFor(plan, interval).ifBlank { throw unavailable() }

        val params = mutableListOf(
            "mode" to "subscription",
            "line_items[0][price]" to priceId,
            "line_items[0][quantity]" to "1",
            "success_url" to "${returnUrl()}?billing=success",
            "cancel_url" to "${returnUrl()}?billing=canceled",
            "client_reference_id" to stammtischId.toString(),
            "locale" to "auto",
            "metadata[stammtisch_id]" to stammtischId.toString(),
            "metadata[kind]" to KIND_PLAN,
            "subscription_data[metadata][stammtisch_id]" to stammtischId.toString(),
            "subscription_data[metadata][kind]" to KIND_PLAN
        )
        if (customerId != null) {
            params += "customer" to customerId
        } else {
            principal.email?.takeIf { it.isNotBlank() }?.let { params += "customer_email" to it }
        }
        return BillingRedirectDto(stripe.createCheckoutSession(params))
    }

    /** Optionaler monatlicher Förderbeitrag einer Person; ändert keinen Tarif. */
    fun supporterCheckout(principal: UserPrincipal): BillingRedirectDto {
        requireStripe()
        val priceId = properties.prices.supporter.ifBlank { throw unavailable() }
        val stammtischId = TenantContext.requireStammtischId()
        val params = mutableListOf(
            "mode" to "subscription",
            "line_items[0][price]" to priceId,
            "line_items[0][quantity]" to "1",
            "success_url" to "${returnUrl()}?billing=thanks",
            "cancel_url" to "${returnUrl()}?billing=canceled",
            "locale" to "auto",
            "metadata[kind]" to KIND_SUPPORTER,
            "metadata[stammtisch_id]" to stammtischId.toString(),
            "subscription_data[metadata][kind]" to KIND_SUPPORTER
        )
        principal.email?.takeIf { it.isNotBlank() }?.let { params += "customer_email" to it }
        return BillingRedirectDto(stripe.createCheckoutSession(params))
    }

    /** Stripe-Kundenportal: Zahlart, Rechnungen, Tarif wechseln oder kündigen. */
    fun portal(principal: UserPrincipal): BillingRedirectDto {
        requireManage(principal)
        requireStripe()
        val stammtischId = TenantContext.requireStammtischId()
        val customerId = tenantTransactions.readAsSystem {
            subscriptionRepository.findById(stammtischId).orElse(null)?.stripeCustomerId
        } ?: throw ApiException(ErrorCode.BILLING_NO_CUSTOMER, Msg("error.billing.noCustomer"), HttpStatus.CONFLICT)
        return BillingRedirectDto(stripe.createPortalSession(customerId, returnUrl()))
    }

    /** Ist der Stammtisch nach Ablauf der Kulanzfrist nur noch lesbar? */
    fun isReadOnly(stammtischId: UUID): Boolean = tenantTransactions.readAsSystem {
        subscriptionRepository.findById(stammtischId).map { it.isReadOnly(Instant.now(clock)) }.orElse(false)
    }

    /** Tarif und Zahlungsstand für die Plattform-Übersicht (ohne Stammtisch-Kontext). */
    fun subscriptionOf(stammtischId: UUID): StammtischSubscriptionEntity? =
        tenantTransactions.readAsSystem { subscriptionRepository.findById(stammtischId).orElse(null) }

    /**
     * Plattform-Administration: Tarif ohne Zahlung vergeben (`comped`) oder auf
     * den kostenlosen Tarif zurücksetzen. Ein laufendes Stripe-Abo bleibt
     * unberührt; seine nächsten Webhooks setzen den Tarif wieder.
     */
    fun setPlanManually(stammtischId: UUID, planCode: String, actor: UserEntity?): StammtischSubscriptionEntity {
        val plan = BillingPlan.entries.firstOrNull { it.name == planCode }
            ?: throw InvalidRequestException(Msg("error.billing.invalidPlan"), ErrorCode.INVALID_REQUEST)
        val saved = tenantTransactions.asSystem {
            val subscription = subscriptionRepository.findById(stammtischId)
                .orElseGet { StammtischSubscriptionEntity(stammtischId = stammtischId) }
            subscription.plan = plan
            subscription.status = if (plan == BillingPlan.free) SubscriptionStatus.none else SubscriptionStatus.comped
            subscription.billingInterval = null
            subscription.graceUntil = null
            subscription.updatedAt = Instant.now(clock)
            subscriptionRepository.saveAndFlush(subscription)
        }
        tenantTransactions.inStammtisch(stammtischId) {
            auditService.recordStammtischChange(
                actor, AuditService.ACTION_STAMMTISCH_PLAN_CHANGED, stammtischId,
                "plan=${saved.plan}; status=${saved.status}; source=platform"
            )
        }
        return saved
    }

    private fun offer(plan: BillingPlan): PlanOfferDto {
        val amounts = properties.amounts
        val (month, year) = when (plan) {
            BillingPlan.free -> 0 to 0
            BillingPlan.stammtisch -> amounts.stammtischMonth.takeIf { properties.prices.stammtischMonth.isNotBlank() || !properties.configured } to
                amounts.stammtischYear.takeIf { properties.prices.stammtischYear.isNotBlank() || !properties.configured }
            BillingPlan.verein -> amounts.vereinMonth.takeIf { properties.prices.vereinMonth.isNotBlank() || !properties.configured } to
                amounts.vereinYear.takeIf { properties.prices.vereinYear.isNotBlank() || !properties.configured }
        }
        return PlanOfferDto(plan.name, limitsDto(plan), month, year)
    }

    private fun limitsDto(plan: BillingPlan): PlanLimitsDto {
        val limits = PlanLimits.limitsOf(plan)
        return PlanLimitsDto(limits.maxMembers, limits.storageBytes, limits.videos, limits.multipleKiosks)
    }

    private fun priceFor(plan: BillingPlan, interval: BillingInterval): String {
        val prices = properties.prices
        return when (plan to interval) {
            BillingPlan.stammtisch to BillingInterval.month -> prices.stammtischMonth
            BillingPlan.stammtisch to BillingInterval.year -> prices.stammtischYear
            BillingPlan.verein to BillingInterval.month -> prices.vereinMonth
            BillingPlan.verein to BillingInterval.year -> prices.vereinYear
            else -> ""
        }
    }

    private fun returnUrl() = "${properties.appUrl.trimEnd('/')}/stammtisch"

    private fun requireManage(principal: UserPrincipal) {
        if (!principal.hasPermission(Permission.BILLING_MANAGE)) {
            throw PermissionDeniedException(Msg("error.billing.manageDenied"), ErrorCode.PERMISSION_DENIED)
        }
    }

    private fun requireStripe() {
        if (!properties.configured) throw unavailable()
    }

    private fun unavailable() =
        ApiException(ErrorCode.BILLING_UNAVAILABLE, Msg("error.billing.unavailable"), HttpStatus.SERVICE_UNAVAILABLE)

    companion object {
        const val KIND_PLAN = "plan"
        const val KIND_SUPPORTER = "supporter"
    }
}
