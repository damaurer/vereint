package de.maurer.baseservice.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant

/** Ob eine Kiosk-PIN gesetzt ist; die PIN selbst verlässt den Server nie. */
data class KioskStatusDto(
    val pinConfigured: Boolean,
    val pinUpdatedAt: Instant?,
    val pinUpdatedByName: String?
)

/** Neue Kiosk-PIN (nur Vorstand und Administration): 4 bis 8 Ziffern. */
data class SetKioskPinRequest(
    @field:NotBlank(message = "pin {validation.notBlank}")
    @field:Size(max = 64, message = "pin {validation.size.max}")
    val pin: String? = null
)

data class KioskUnlockRequest(
    @field:NotBlank(message = "pin {validation.notBlank}")
    @field:Size(max = 64, message = "pin {validation.size.max}")
    val pin: String? = null
)

/**
 * Ergebnis einer PIN-Prüfung. Bei falscher PIN steht in [remainingAttempts], wie
 * viele Versuche bis zur Sperre bleiben; ist die Eingabe gesperrt, nennt
 * [lockedUntil] das Ende der Sperre.
 */
data class KioskUnlockResultDto(
    val unlocked: Boolean,
    val remainingAttempts: Int?,
    val lockedUntil: Instant?
)
