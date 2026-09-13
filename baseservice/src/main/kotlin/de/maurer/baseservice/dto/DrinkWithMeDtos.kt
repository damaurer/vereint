package de.maurer.baseservice.dto

import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size
import java.time.Instant

/**
 * Anfrage zum Starten einer zeitlich begrenzten DrinkWithMe-Session (TICKET-021).
 *
 * Eine Standortfreigabe ist zweckgebunden und opt-in: `consent` muss explizit
 * `true` sein, sonst wird die Freigabe serverseitig abgelehnt. Koordinaten sind
 * optional (eine Session ohne Standort teilt nur die Einladung „Trink mit mir");
 * werden sie übermittelt, müssen sie im gültigen Wertebereich liegen. Die
 * Sichtbarkeit endet spätestens mit `durationMinutes`.
 */
data class StartDrinkWithMeRequest(
    val consent: Boolean = false,

    @field:DecimalMin(value = "-90.0", message = "latitude muss zwischen -90 und 90 liegen")
    @field:DecimalMax(value = "90.0", message = "latitude muss zwischen -90 und 90 liegen")
    val latitude: Double? = null,

    @field:DecimalMin(value = "-180.0", message = "longitude muss zwischen -180 und 180 liegen")
    @field:DecimalMax(value = "180.0", message = "longitude muss zwischen -180 und 180 liegen")
    val longitude: Double? = null,

    @field:Size(max = 255, message = "message darf höchstens 255 Zeichen lang sein")
    val message: String? = null,

    @field:Min(value = 1, message = "durationMinutes muss mindestens 1 betragen")
    @field:Max(value = 720, message = "durationMinutes darf höchstens 720 betragen")
    val durationMinutes: Int? = null
)

/**
 * Öffentliche Sicht auf eine DrinkWithMe-Session. Enthält den Anzeigenamen des
 * teilenden Mitglieds sowie – nur solange die Session aktiv und nicht abgelaufen
 * ist – die freigegebenen Koordinaten. Eine Standortfreigabe autorisiert keine
 * Zahlung.
 */
data class DrinkWithMeSessionDto(
    val id: String,
    val eventId: String,
    val userId: String,
    val userName: String,
    val latitude: Double?,
    val longitude: Double?,
    val message: String?,
    val active: Boolean,
    val expiresAt: Instant,
    val createdAt: Instant
)
