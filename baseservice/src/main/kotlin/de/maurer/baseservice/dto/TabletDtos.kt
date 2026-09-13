package de.maurer.baseservice.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import java.time.Instant

/**
 * Erfassung eines manuellen Tablet-Kaufs (TICKET-017).
 *
 * Das Tablet wählt ausschließlich das Eventmitglied (`memberId`) und das
 * eventbezogene Getränk (`eventDrinkId`) aus. Preis, Währung, Abrechnungsmodus und
 * Herkunft werden serverseitig bestimmt; das Tablet darf sie nicht vorgeben.
 */
data class TabletPurchaseRequest(
    @field:NotBlank(message = "memberId darf nicht leer sein")
    val memberId: String? = null,

    @field:NotBlank(message = "eventDrinkId darf nicht leer sein")
    val eventDrinkId: String? = null
)

/**
 * Erfassung einer Runde oder Abendaktion (TICKET-018).
 *
 * Der Tablet-Recorder wählt ausschließlich das eventbezogene Getränk (`eventDrinkId`)
 * und die begünstigten Eventmitglieder (`memberIds`). Preis, Währung und Herkunft
 * (`round`/`evening`) bestimmt der Server; der Abrechnungsmodus ist stets
 * `revenueOnly` und belastet kein persönliches Guthaben.
 */
data class TabletRevenuePurchaseRequest(
    @field:NotBlank(message = "eventDrinkId darf nicht leer sein")
    val eventDrinkId: String? = null,

    @field:NotEmpty(message = "memberIds darf nicht leer sein")
    val memberIds: List<String>? = null
)

/** Kompaktes aktives Event für die Tablet-Auswahl. */
data class TabletEventDto(
    val id: String,
    val title: String,
    val location: String?,
    val startsAt: Instant,
    val status: String
)

/** Für den Tablet-Kontext freigegebenes Eventmitglied. */
data class TabletMemberDto(
    val memberId: String,
    val displayName: String
)
