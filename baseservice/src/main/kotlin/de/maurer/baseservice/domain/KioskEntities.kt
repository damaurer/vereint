package de.maurer.baseservice.domain

import jakarta.persistence.*
import java.time.Instant

/**
 * Einstellungen des Kiosk-Modus am Thekenterminal. Es gibt genau eine Zeile
 * ([DEFAULT_ID]). Die PIN liegt nur als BCrypt-Hash vor; Fehlversuche und die
 * Sperre nach zu vielen Fehlversuchen gelten für alle Terminals gemeinsam.
 */
@Entity
@Table(name = "kiosk_settings")
class KioskSettingsEntity(
    @Id
    @Column(name = "id", length = 32, nullable = false)
    var id: String = DEFAULT_ID,

    @Column(name = "pin_hash", length = 100)
    var pinHash: String? = null,

    @Column(name = "failed_attempts", nullable = false)
    var failedAttempts: Int = 0,

    /** Anzahl der Sperren seit der letzten richtigen Eingabe; verlängert die nächste Sperre. */
    @Column(name = "lockout_count", nullable = false)
    var lockoutCount: Int = 0,

    @Column(name = "locked_until")
    var lockedUntil: Instant? = null,

    @Column(name = "pin_updated_at")
    var pinUpdatedAt: Instant? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pin_updated_by")
    var pinUpdatedBy: UserEntity? = null,

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) {
    val pinConfigured: Boolean get() = !pinHash.isNullOrEmpty()

    fun isLocked(now: Instant): Boolean = lockedUntil?.isAfter(now) == true

    companion object {
        const val DEFAULT_ID = "default"
    }
}
