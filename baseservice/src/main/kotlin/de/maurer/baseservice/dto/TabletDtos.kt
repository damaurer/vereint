package de.maurer.baseservice.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import java.time.Instant

/**
 * Erfassung eines manuellen Tablet-Kaufs (Getränk oder Speise).
 */
data class TabletPurchaseRequest(
    @field:NotBlank(message = "memberId darf nicht leer sein")
    val memberId: String? = null,

    val eventDrinkId: String? = null,
    val eventFoodId: String? = null
)

/**
 * Erfassung einer Runde oder Abendaktion (Getränk oder Speise).
 */
data class TabletRevenuePurchaseRequest(
    val eventDrinkId: String? = null,
    val eventFoodId: String? = null,

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

/** Kombiniertes Angebot an Getränken und Speisen für die Tablet-Strichliste. */
data class TabletItemsDto(
    val drinks: List<EventDrinkDto>,
    val food: List<EventFoodDto>
)
