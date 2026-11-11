package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/** Art einer Runde: ein Getränk je Eingeladenem oder alles bis zur Höchstsumme. */
enum class RoundKind {
    round,
    evening;

    companion object {
        fun fromValue(value: String?): RoundKind? = entries.firstOrNull { it.name == value }
    }
}

/**
 * Runde, die eine Person im laufenden Event mit dem eigenen Guthaben ausgibt
 * (Issue #81). Abgebucht wird erst, wenn eine eingeladene Person an der Theke
 * einen Strich bekommt; die Buchung geht dann auf den [sponsor] und verweist auf
 * die Runde. Verbrauch und Einlösungen ergeben sich aus diesen Buchungen.
 */
@Entity
@Table(name = "rounds")
@EntityListeners(AuditingEntityListener::class)
class RoundEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id", nullable = false)
    var event: EventEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sponsor_id", nullable = false)
    var sponsor: UserEntity? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", length = 16, nullable = false)
    var kind: RoundKind = RoundKind.round,

    /** Eventgetränk der Runde; `null` = alle Getränke. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_drink_id")
    var eventDrink: EventDrinkEntity? = null,

    @Column(name = "max_amount", precision = 10, scale = 2, nullable = false)
    var maxAmount: BigDecimal = BigDecimal.ZERO,

    @Column(name = "currency", length = 3, nullable = false)
    var currency: String = "EUR",

    /** Ende der Gültigkeit; `null` = bis Event-Ende. */
    @Column(name = "valid_until")
    var validUntil: Instant? = null,

    /** Vorzeitig beendet durch den Geber oder den Vorstand. */
    @Column(name = "ended_at")
    var endedAt: Instant? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped() {
    /** Läuft die Runde zum Zeitpunkt [now] (nicht beendet, nicht abgelaufen)? */
    fun isRunning(now: Instant): Boolean =
        endedAt == null && (validUntil?.isAfter(now) ?: true) && event?.status == EventStatus.active
}

@Entity
@Table(
    name = "round_invitees",
    uniqueConstraints = [UniqueConstraint(name = "uk_round_invitees_round_member", columnNames = ["round_id", "member_id"])]
)
@EntityListeners(AuditingEntityListener::class)
class RoundInviteeEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "round_id", nullable = false)
    var round: RoundEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    var member: UserEntity? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now()
) : StammtischScoped()
