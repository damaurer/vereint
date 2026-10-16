package de.maurer.baseservice.domain

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

/** Tarife des Finanzierungsmodells; die Grenzen stehen in [de.maurer.baseservice.service.PlanLimits]. */
enum class BillingPlan { free, stammtisch, verein }

enum class BillingInterval { month, year }

/**
 * Zahlungsstand eines Stammtischs.
 *
 * - `none`: kostenloser Tarif, nie gebucht.
 * - `active`: Abo bei Stripe läuft und ist bezahlt.
 * - `past_due`: Zahlung fehlgeschlagen; bis `grace_until` läuft alles weiter,
 *   danach ist der Stammtisch nur noch lesbar.
 * - `canceled`: Abo beendet, der Stammtisch ist zurück im kostenlosen Tarif.
 * - `comped`: Tarif ohne Zahlung, von der Plattform-Administration vergeben.
 */
enum class SubscriptionStatus { none, active, past_due, canceled, comped }

/**
 * Tarif eines Stammtischs. Gehört keinem Stammtisch (keine Row-Level-Security)
 * und wird nur vom Fachservice geschrieben: von Stripe-Webhooks und der
 * Plattform-Administration. Fehlt die Zeile, gilt der kostenlose Tarif.
 */
@Entity
@Table(name = "stammtisch_subscriptions")
class StammtischSubscriptionEntity(
    @Id
    @Column(name = "stammtisch_id", nullable = false)
    var stammtischId: UUID = UUID.randomUUID(),

    @Enumerated(EnumType.STRING)
    @Column(name = "plan", length = 16, nullable = false)
    var plan: BillingPlan = BillingPlan.free,

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_interval", length = 8)
    var billingInterval: BillingInterval? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16, nullable = false)
    var status: SubscriptionStatus = SubscriptionStatus.none,

    @Column(name = "stripe_customer_id", length = 64)
    var stripeCustomerId: String? = null,

    @Column(name = "stripe_subscription_id", length = 64)
    var stripeSubscriptionId: String? = null,

    @Column(name = "current_period_end")
    var currentPeriodEnd: Instant? = null,

    /** Ende der Kulanzfrist nach einer fehlgeschlagenen Zahlung. */
    @Column(name = "grace_until")
    var graceUntil: Instant? = null,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) {
    /** Nach Ablauf der Kulanzfrist darf der Stammtisch nur noch gelesen werden. */
    fun isReadOnly(now: Instant): Boolean =
        status == SubscriptionStatus.past_due && graceUntil?.let { now.isAfter(it) } == true
}

/** Verarbeitetes Stripe-Ereignis (Schutz gegen doppelte Zustellung). */
@Entity
@Table(name = "billing_events")
class BillingEventEntity(
    @Id
    @Column(name = "id", length = 255, nullable = false)
    var id: String = "",

    @Column(name = "type", length = 128, nullable = false)
    var type: String = "",

    @Column(name = "stammtisch_id")
    var stammtischId: UUID? = null,

    @Column(name = "received_at", nullable = false)
    var receivedAt: Instant = Instant.now()
)
