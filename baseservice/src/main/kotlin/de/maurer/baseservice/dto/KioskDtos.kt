package de.maurer.baseservice.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant

/** Start des Kiosk-Modus auf einem Gerät mit dessen eigener PIN (4 bis 8 Ziffern). */
data class StartKioskSessionRequest(
    @field:NotBlank(message = "pin {validation.notBlank}")
    @field:Size(max = 64, message = "pin {validation.size.max}")
    val pin: String? = null,

    @field:Size(max = 60, message = "label {validation.size.max}")
    val label: String? = null
)

data class KioskUnlockRequest(
    @field:NotBlank(message = "pin {validation.notBlank}")
    @field:Size(max = 64, message = "pin {validation.size.max}")
    val pin: String? = null
)

/** Kiosk-Sitzung für die Geräteübersicht; die PIN verlässt den Server nie. */
data class KioskSessionDto(
    val id: String,
    val label: String,
    val startedByName: String?,
    val startedAt: Instant,
    val active: Boolean,
    /** `pin` (am Gerät entsperrt) oder `remote` (von Vorstand/Administration beendet). */
    val endReason: String?,
    val lockedUntil: Instant?
)

/**
 * Ergebnis einer PIN-Prüfung am Gerät. Bei falscher PIN steht in [remainingAttempts], wie
 * viele Versuche bis zur Sperre bleiben; ist die Eingabe gesperrt, nennt
 * [lockedUntil] das Ende der Sperre.
 */
data class KioskUnlockResultDto(
    val unlocked: Boolean,
    val remainingAttempts: Int?,
    val lockedUntil: Instant?
)
