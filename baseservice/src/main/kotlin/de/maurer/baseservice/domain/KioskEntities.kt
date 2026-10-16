package de.maurer.baseservice.domain

import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

/**
 * Kiosk-Sitzung eines Thekenterminal-Geräts. Das Gerät vergibt beim Start eine
 * eigene PIN, gespeichert wird nur ihr BCrypt-Hash. Die Sitzung endet mit der
 * richtigen PIN am Gerät ([END_REASON_PIN]) oder wenn Vorstand oder
 * Administration sie aus der Ferne beenden ([END_REASON_REMOTE]).
 */
@Entity
@Table(name = "kiosk_sessions")
class KioskSessionEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    /** Gerätename für die Übersicht des Vorstands, etwa „Theke links“. */
    @Column(name = "label", length = 60, nullable = false)
    var label: String = "",

    @Column(name = "pin_hash", length = 100, nullable = false)
    var pinHash: String = "",

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "started_by", nullable = false)
    var startedBy: UserEntity? = null,

    @Column(name = "started_at", nullable = false)
    var startedAt: Instant = Instant.now(),

    @Column(name = "failed_attempts", nullable = false)
    var failedAttempts: Int = 0,

    /** Anzahl der Sperren dieser Sitzung; verlängert die nächste Sperre. */
    @Column(name = "lockout_count", nullable = false)
    var lockoutCount: Int = 0,

    @Column(name = "locked_until")
    var lockedUntil: Instant? = null,

    @Column(name = "ended_at")
    var endedAt: Instant? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ended_by")
    var endedBy: UserEntity? = null,

    @Column(name = "end_reason", length = 16)
    var endReason: String? = null,

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped() {
    val active: Boolean get() = endedAt == null

    fun isLocked(now: Instant): Boolean = lockedUntil?.isAfter(now) == true

    companion object {
        const val END_REASON_PIN = "pin"
        const val END_REASON_REMOTE = "remote"
    }
}
