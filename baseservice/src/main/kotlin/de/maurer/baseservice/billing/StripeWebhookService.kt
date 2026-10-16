package de.maurer.baseservice.billing

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.domain.BillingEventEntity
import de.maurer.baseservice.domain.BillingInterval
import de.maurer.baseservice.domain.BillingPlan
import de.maurer.baseservice.domain.StammtischSubscriptionEntity
import de.maurer.baseservice.domain.SubscriptionStatus
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.repository.BillingEventRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.StammtischSubscriptionRepository
import de.maurer.baseservice.service.AuditService
import de.maurer.baseservice.tenancy.TenantTransactions
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.HexFormat
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Verarbeitet Stripe-Webhooks und hält damit den Tarif jedes Stammtischs aktuell.
 *
 * - Die Signatur (`Stripe-Signature`, HMAC-SHA256 über `zeitstempel.nutzdaten`)
 *   wird mit dem Webhook-Secret geprüft; ältere Zeitstempel als
 *   [TOLERANCE] werden abgelehnt.
 * - Jedes Ereignis wirkt genau einmal (`billing_events`).
 * - Zahlung fehlgeschlagen: Status `past_due`, Kulanzfrist
 *   [BillingProperties.graceDays]; danach ist der Stammtisch nur lesbar.
 *   Daten werden nie gelöscht.
 */
@Service
class StripeWebhookService(
    private val properties: BillingProperties,
    private val objectMapper: ObjectMapper,
    private val subscriptionRepository: StammtischSubscriptionRepository,
    private val billingEventRepository: BillingEventRepository,
    private val stammtischRepository: StammtischRepository,
    private val tenantTransactions: TenantTransactions,
    private val auditService: AuditService,
    private val clock: Clock = Clock.systemUTC()
) {

    private val log = LoggerFactory.getLogger(StripeWebhookService::class.java)

    private val priceIndex: Map<String, Pair<BillingPlan, BillingInterval>> by lazy {
        val prices = properties.prices
        listOf(
            prices.stammtischMonth to (BillingPlan.stammtisch to BillingInterval.month),
            prices.stammtischYear to (BillingPlan.stammtisch to BillingInterval.year),
            prices.vereinMonth to (BillingPlan.verein to BillingInterval.month),
            prices.vereinYear to (BillingPlan.verein to BillingInterval.year)
        ).filter { it.first.isNotBlank() }.toMap()
    }

    private data class Change(val stammtischId: UUID, val subscription: StammtischSubscriptionEntity)

    fun handle(payload: ByteArray, signatureHeader: String?) {
        if (!properties.configured) {
            throw ApiException(ErrorCode.BILLING_UNAVAILABLE, Msg("error.billing.unavailable"), HttpStatus.SERVICE_UNAVAILABLE)
        }
        verifySignature(payload, signatureHeader)
        val event = runCatching { objectMapper.readTree(payload) }.getOrNull()
            ?: throw InvalidRequestException(Msg("error.billing.invalidWebhook"), ErrorCode.INVALID_REQUEST)
        val eventId = event.path("id").asText()
        val type = event.path("type").asText()
        if (eventId.isBlank() || type.isBlank()) {
            throw InvalidRequestException(Msg("error.billing.invalidWebhook"), ErrorCode.INVALID_REQUEST)
        }
        val obj = event.path("data").path("object")

        val change = try {
            tenantTransactions.asSystem {
                if (billingEventRepository.existsById(eventId)) return@asSystem null
                val change = apply(type, obj)
                billingEventRepository.saveAndFlush(
                    BillingEventEntity(id = eventId, type = type.take(128), stammtischId = change?.stammtischId, receivedAt = Instant.now(clock))
                )
                change
            }
        } catch (ex: DataIntegrityViolationException) {
            // Gleichzeitige Doppelzustellung: die andere Anfrage hat es verarbeitet.
            null
        }
        log.info("stripe webhook processed type={} event={} stammtisch={}", type, eventId, change?.stammtischId)
        change?.let { (stammtischId, subscription) ->
            tenantTransactions.inStammtisch(stammtischId) {
                auditService.recordStammtischChange(
                    null, AuditService.ACTION_STAMMTISCH_PLAN_CHANGED, stammtischId,
                    "plan=${subscription.plan}; status=${subscription.status}; source=stripe:$type"
                )
            }
        }
    }

    private fun apply(type: String, obj: JsonNode): Change? = when (type) {
        "checkout.session.completed" -> checkoutCompleted(obj)
        "customer.subscription.created", "customer.subscription.updated" -> subscriptionChanged(obj)
        "customer.subscription.deleted" -> subscriptionDeleted(obj)
        "invoice.payment_failed" -> invoiceFailed(obj)
        "invoice.paid" -> invoicePaid(obj)
        else -> null
    }

    private fun checkoutCompleted(session: JsonNode): Change? {
        if (session.path("mode").asText() != "subscription") return null
        if (session.path("metadata").path("kind").asText() != BillingService.KIND_PLAN) return null
        val stammtischId = uuid(session.path("client_reference_id").asText()) ?: return null
        if (!stammtischRepository.existsById(stammtischId)) return null
        val subscription = subscriptionRepository.findById(stammtischId)
            .orElseGet { StammtischSubscriptionEntity(stammtischId = stammtischId) }
        text(session, "customer")?.let { subscription.stripeCustomerId = it }
        text(session, "subscription")?.let { newId ->
            // Ein anderes Abo derselben Stammtisch-ID belegt die Kennung nicht doppelt.
            if (subscription.stripeSubscriptionId != newId) {
                subscriptionRepository.findByStripeSubscriptionId(newId).ifPresent { other ->
                    if (other.stammtischId != stammtischId) other.stripeSubscriptionId = null
                }
            }
            subscription.stripeSubscriptionId = newId
        }
        if (subscription.status != SubscriptionStatus.past_due) {
            subscription.status = SubscriptionStatus.active
            subscription.graceUntil = null
        }
        // Tarif und Zahlweise kommen verbindlich mit customer.subscription.*;
        // bis dahin gilt, was gebucht wurde.
        return save(stammtischId, subscription)
    }

    private fun subscriptionChanged(stripeSubscription: JsonNode): Change? {
        if (stripeSubscription.path("metadata").path("kind").asText() == BillingService.KIND_SUPPORTER) return null
        val stripeId = text(stripeSubscription, "id") ?: return null
        val subscription = findFor(stripeSubscription, stripeId) ?: return null
        val stripeStatus = stripeSubscription.path("status").asText()
        val belongsHere = subscription.stripeSubscriptionId == null || subscription.stripeSubscriptionId == stripeId
        if (!belongsHere && stripeStatus !in ACTIVE_STATES) return null

        subscription.stripeSubscriptionId = stripeId
        text(stripeSubscription, "customer")?.let { subscription.stripeCustomerId = it }
        val item = stripeSubscription.path("items").path("data").path(0)
        priceIndex[item.path("price").path("id").asText()]?.let { (plan, interval) ->
            subscription.plan = plan
            subscription.billingInterval = interval
        }
        (epoch(stripeSubscription.path("current_period_end")) ?: epoch(item.path("current_period_end")))
            ?.let { subscription.currentPeriodEnd = it }

        when (stripeStatus) {
            in ACTIVE_STATES -> {
                subscription.status = SubscriptionStatus.active
                subscription.graceUntil = null
            }
            "past_due", "unpaid" -> markPastDue(subscription)
            "canceled", "incomplete_expired" -> downgrade(subscription)
            else -> Unit // incomplete, paused: Stand bleibt, bis Stripe entscheidet
        }
        return save(subscription.stammtischId, subscription)
    }

    private fun subscriptionDeleted(stripeSubscription: JsonNode): Change? {
        val stripeId = text(stripeSubscription, "id") ?: return null
        val subscription = subscriptionRepository.findByStripeSubscriptionId(stripeId).orElse(null) ?: return null
        downgrade(subscription)
        return save(subscription.stammtischId, subscription)
    }

    private fun invoiceFailed(invoice: JsonNode): Change? {
        val subscription = invoiceSubscription(invoice) ?: return null
        markPastDue(subscription)
        return save(subscription.stammtischId, subscription)
    }

    private fun invoicePaid(invoice: JsonNode): Change? {
        val subscription = invoiceSubscription(invoice) ?: return null
        if (subscription.status == SubscriptionStatus.active && subscription.graceUntil == null) return null
        subscription.status = SubscriptionStatus.active
        subscription.graceUntil = null
        return save(subscription.stammtischId, subscription)
    }

    private fun invoiceSubscription(invoice: JsonNode): StammtischSubscriptionEntity? {
        // Ab API-Version 2025-03-31 steht das Abo unter parent.subscription_details.
        val stripeId = text(invoice, "subscription")
            ?: text(invoice.path("parent").path("subscription_details"), "subscription")
            ?: return null
        return subscriptionRepository.findByStripeSubscriptionId(stripeId).orElse(null)
    }

    private fun findFor(stripeSubscription: JsonNode, stripeId: String): StammtischSubscriptionEntity? {
        subscriptionRepository.findByStripeSubscriptionId(stripeId).orElse(null)?.let { return it }
        val metadata = stripeSubscription.path("metadata")
        if (metadata.path("kind").asText() != BillingService.KIND_PLAN) return null
        val stammtischId = uuid(metadata.path("stammtisch_id").asText()) ?: return null
        if (!stammtischRepository.existsById(stammtischId)) return null
        return subscriptionRepository.findById(stammtischId)
            .orElseGet { StammtischSubscriptionEntity(stammtischId = stammtischId) }
    }

    private fun markPastDue(subscription: StammtischSubscriptionEntity) {
        if (subscription.status != SubscriptionStatus.past_due || subscription.graceUntil == null) {
            subscription.graceUntil = Instant.now(clock).plus(Duration.ofDays(properties.graceDays))
        }
        subscription.status = SubscriptionStatus.past_due
    }

    /** Abo beendet: zurück in den kostenlosen Tarif, alle Daten bleiben. */
    private fun downgrade(subscription: StammtischSubscriptionEntity) {
        subscription.plan = BillingPlan.free
        subscription.billingInterval = null
        subscription.status = SubscriptionStatus.canceled
        subscription.stripeSubscriptionId = null
        subscription.currentPeriodEnd = null
        subscription.graceUntil = null
    }

    private fun save(stammtischId: UUID, subscription: StammtischSubscriptionEntity): Change {
        subscription.updatedAt = Instant.now(clock)
        return Change(stammtischId, subscriptionRepository.saveAndFlush(subscription))
    }

    private fun verifySignature(payload: ByteArray, header: String?) {
        val parts = header.orEmpty().split(',').mapNotNull {
            val index = it.indexOf('=')
            if (index <= 0) null else it.substring(0, index).trim() to it.substring(index + 1).trim()
        }
        val timestamp = parts.firstOrNull { it.first == "t" }?.second?.toLongOrNull()
        val signatures = parts.filter { it.first == "v1" }.map { it.second }
        if (timestamp == null || signatures.isEmpty()) throw invalidSignature()
        val age = Duration.between(Instant.ofEpochSecond(timestamp), Instant.now(clock)).abs()
        if (age > TOLERANCE) throw invalidSignature()

        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(properties.stripeWebhookSecret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        mac.update("$timestamp.".toByteArray(Charsets.UTF_8))
        val expected = HexFormat.of().formatHex(mac.doFinal(payload)).toByteArray(Charsets.US_ASCII)
        val valid = signatures.any { MessageDigest.isEqual(expected, it.lowercase().toByteArray(Charsets.US_ASCII)) }
        if (!valid) throw invalidSignature()
    }

    private fun invalidSignature(): ApiException {
        log.warn("stripe webhook rejected: invalid signature")
        return InvalidRequestException(Msg("error.billing.invalidWebhook"), ErrorCode.INVALID_REQUEST)
    }

    private fun text(node: JsonNode, field: String): String? =
        node.path(field).takeIf { it.isTextual }?.asText()?.takeIf { it.isNotBlank() }

    private fun epoch(node: JsonNode): Instant? =
        node.takeIf { it.isNumber }?.asLong()?.let { Instant.ofEpochSecond(it) }

    private fun uuid(value: String): UUID? = runCatching { UUID.fromString(value) }.getOrNull()

    companion object {
        val TOLERANCE: Duration = Duration.ofMinutes(5)
        private val ACTIVE_STATES = setOf("active", "trialing")
    }
}
