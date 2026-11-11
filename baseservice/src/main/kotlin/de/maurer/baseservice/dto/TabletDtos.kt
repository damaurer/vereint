package de.maurer.baseservice.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import java.math.BigDecimal
import java.time.Instant

/**
 * Erfassung eines manuellen Tablet-Kaufs (Getränk oder Speise).
 */
data class TabletPurchaseRequest(
    @field:NotBlank(message = "memberId {validation.notBlank}")
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

    @field:NotEmpty(message = "memberIds {validation.notBlank}")
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

/** Getränk einer Spalte, das im Event am Terminal buchbar ist. */
data class TabletBoardDrinkDto(
    val eventDrinkId: String,
    val drinkName: String
)

/** Spalte der Strichliste: Strich-Kategorie mit Preis je Strich (Issue #80). */
data class TabletBoardColumnDto(
    val categoryId: String,
    val name: String,
    val price: BigDecimal,
    val currency: String,
    /** Buchbare Eventgetränke der Kategorie; ein Tipp wählt eines davon. */
    val drinks: List<TabletBoardDrinkDto>
)

/** Zeile der Strichliste: Mitglied mit seinen Strichen des Abends je Spalte. */
data class TabletBoardMemberDto(
    val memberId: String,
    val displayName: String,
    /** Striche je Kategorie-ID. */
    val counts: Map<String, Int>,
    /** Käufe ohne Kategorie (Sonstiges, Speisen). */
    val otherCount: Int
)

/** Strichliste eines Events: Spalten, Zeilen und „Heute an der Theke“. */
data class TabletBoardDto(
    val columns: List<TabletBoardColumnDto>,
    val members: List<TabletBoardMemberDto>,
    val tallyCount: Int,
    val revenue: BigDecimal,
    val currency: String
)
