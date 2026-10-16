package de.maurer.baseservice.dto

import java.time.Instant

/** Tarif, Grenzen und Verbrauch des aktuellen Stammtischs. */
data class BillingOverviewDto(
    val plan: String,
    val interval: String?,
    val status: String,
    /** Kulanzfrist abgelaufen: der Stammtisch ist nur noch lesbar. */
    val readOnly: Boolean,
    val graceUntil: Instant?,
    val currentPeriodEnd: Instant?,
    val limits: PlanLimitsDto,
    val usage: PlanUsageDto,
    /** Darf die anfragende Person den Tarif buchen und das Zahlungsportal öffnen (`billing.manage`)? */
    val canManage: Boolean,
    /** Online-Zahlung ist eingerichtet (Stripe). */
    val checkoutAvailable: Boolean,
    val supporterAvailable: Boolean,
    val supporterAmountCents: Int?,
    /** Es gibt ein Kundenkonto bei Stripe (Portal für Rechnungen und Kündigung). */
    val hasPaymentAccount: Boolean,
    val plans: List<PlanOfferDto>
)

data class PlanLimitsDto(
    /** `null` = unbegrenzt. */
    val maxMembers: Long?,
    val storageBytes: Long,
    val videos: Boolean,
    val multipleKiosks: Boolean
)

data class PlanUsageDto(
    val members: Long,
    val storageBytes: Long,
    val activeKiosks: Long
)

/** Ein buchbarer Tarif mit Beträgen in Cent; `null`, wenn die Zahlweise nicht angeboten wird. */
data class PlanOfferDto(
    val plan: String,
    val limits: PlanLimitsDto,
    val monthCents: Int?,
    val yearCents: Int?
)

data class BillingCheckoutRequest(
    /** `stammtisch` oder `verein`. */
    val plan: String? = null,
    /** `month` oder `year`. */
    val interval: String? = null
)

/** Adresse der Stripe-Seite, auf die die App weiterleitet. */
data class BillingRedirectDto(val url: String)
