package de.maurer.baseservice.dto

import jakarta.validation.constraints.NotBlank
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
    val otherCount: Int,
    /** Laufende Runde, auf die der nächste Strich geht; `null` = eigene Rechnung (Issue #81). */
    val fundedBy: RoundFundingDto? = null
)

/** Strichliste eines Events: Spalten, Zeilen und „Heute an der Theke“. */
data class TabletBoardDto(
    val columns: List<TabletBoardColumnDto>,
    val members: List<TabletBoardMemberDto>,
    val tallyCount: Int,
    val revenue: BigDecimal,
    val currency: String,
    /** Laufende Runden des Events, nur zur Anzeige (Issue #81). */
    val rounds: List<RoundDto> = emptyList()
)
