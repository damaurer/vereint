package de.maurer.baseservice.dto

import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Digits
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.math.BigDecimal
import java.time.Instant

/** Dreistelliger ISO-4217-Währungscode; optional, Standard ist EUR. */
private const val CURRENCY_PATTERN = "^[A-Za-z]{3}$"

/**
 * Guthaben-Aufladung (`topup`). Der belastete/gutgeschriebene Betrag ist immer
 * positiv; das Vorzeichen ergibt sich aus der Buchungsart.
 */
data class TopupRequest(
    @field:NotBlank(message = "memberId {validation.notBlank}")
    val memberId: String? = null,

    @field:NotNull(message = "amount {validation.required}")
    @field:DecimalMin(value = "0.01", message = "amount {validation.positive}")
    @field:Digits(integer = 8, fraction = 2, message = "amount {validation.twoDecimals}")
    val amount: BigDecimal? = null,

    @field:Pattern(regexp = CURRENCY_PATTERN, message = "currency {validation.currencyIso}")
    val currency: String? = null,

    @field:Size(max = 255, message = "note {validation.size.max}")
    val note: String? = null
)

/** Guthaben-Auszahlung (`payout`). */
data class PayoutRequest(
    @field:NotBlank(message = "memberId {validation.notBlank}")
    val memberId: String? = null,

    @field:NotNull(message = "amount {validation.required}")
    @field:DecimalMin(value = "0.01", message = "amount {validation.positive}")
    @field:Digits(integer = 8, fraction = 2, message = "amount {validation.twoDecimals}")
    val amount: BigDecimal? = null,

    @field:Pattern(regexp = CURRENCY_PATTERN, message = "currency {validation.currencyIso}")
    val currency: String? = null,

    @field:Size(max = 255, message = "note {validation.size.max}")
    val note: String? = null
)

/** Korrektur einer bestehenden Buchung als Gegenbuchung. */
data class CorrectionRequest(
    @field:NotBlank(message = "originalEntryId {validation.notBlank}")
    val originalEntryId: String? = null,

    @field:Size(max = 255, message = "reason {validation.size.max}")
    val reason: String? = null
)

/**
 * PWA-Barcodekauf eines Mitglieds (`purchase`, `source = pwaBarcode`).
 *
 * Der Client liefert ausschließlich Event und gescannten Barcode; Käufer, Preis,
 * Währung, Getränk und Abrechnungsmodus bestimmt der Server anhand des Eventgetränks
 * (siehe `docs/fachkonzept.md`). Der belastete Käufer ist immer der angemeldete
 * Benutzer.
 */
data class PurchaseRequest(
    @field:NotBlank(message = "eventId {validation.notBlank}")
    val eventId: String? = null,

    @field:NotBlank(message = "barcode {validation.notBlank}")
    @field:Size(max = 128, message = "barcode {validation.size.max}")
    val barcode: String? = null
)

/**
 * Vorschau eines Barcodekaufs, bevor das Mitglied bestätigt. Ohne `eventId`
 * liefert der Server alle laufenden Events des Mitglieds, an denen das Getränk
 * per Selbstbedienung verkauft wird.
 */
data class PurchasePreviewRequest(
    @field:NotBlank(message = "barcode {validation.notBlank}")
    @field:Size(max = 128, message = "barcode {validation.size.max}")
    val barcode: String? = null,

    val eventId: String? = null
)

/** Ein Event, an dem das gescannte Getränk gekauft werden kann, mit dessen Preis. */
data class PurchaseOptionDto(
    val eventId: String,
    val eventTitle: String,
    val unitPrice: BigDecimal,
    val currency: String
)

/** Was ein Barcodekauf kosten würde; es wird nichts gebucht. */
data class PurchasePreviewDto(
    val barcode: String,
    val drinkId: String,
    val drinkName: String,
    val imageReference: String?,
    val options: List<PurchaseOptionDto>,
    val creditBalance: BigDecimal,
    val balanceCurrency: String
)

/** Beleg-Snapshot eines Kaufs; unveränderlich (siehe `docs/fachkonzept.md`). */
data class PurchaseSnapshotDto(
    val itemType: String = "DRINK",
    val drinkName: String? = null,
    val foodName: String? = null,
    val imageReference: String? = null,
    val barcode: String? = null,
    val unitPrice: BigDecimal,
    val costPrice: BigDecimal = BigDecimal.ZERO,
    val profit: BigDecimal = BigDecimal.ZERO,
    val currency: String,
    val catalogVersion: Int? = 1
)

/** Einzelne Ledger-Zeile in Textform der Kennungen (UUID). */
data class LedgerEntryDto(
    val id: String,
    val entryType: String,
    val eventId: String?,
    val memberId: String,
    val memberDisplayName: String,
    val drinkId: String?,
    val foodId: String? = null,
    val amount: BigDecimal,
    val currency: String,
    val accountingMode: String,
    val source: String?,
    val actorId: String,
    val reversesEntryId: String?,
    val idempotencyKey: String,
    val createdAt: Instant,
    val snapshot: PurchaseSnapshotDto?,
    /** Strich-Kategorie, zu deren Preis gebucht wurde (Issue #80). */
    val tallyCategoryId: String? = null,
    val tallyCategoryName: String? = null
)

/**
 * Guthaben und Umsatzkennzahlen einer Person.
 *
 * `creditBalance` = Topups − Payouts − Kredit-Käufe ± Korrekturen. Käufe im Modus
 * `revenueOnly` verändern das Guthaben nicht, erhöhen aber den Umsatz.
 */
/** Zeile der Guthabenübersicht in der Kasse. */
data class MemberBalanceOverviewDto(
    val memberId: String,
    val displayName: String,
    val currency: String,
    val creditBalance: BigDecimal,
    val lastEntryAt: Instant?
)

data class MemberBalanceDto(
    val memberId: String,
    val currency: String,
    val creditBalance: BigDecimal,
    val topupTotal: BigDecimal,
    val payoutTotal: BigDecimal,
    val purchaseTotal: BigDecimal,
    val correctionTotal: BigDecimal,
    val entryCount: Int
)

/** Aggregierte Kassen-/Umsatzsicht eines Events für Vorstand und Administration. */
data class EventLedgerSummaryDto(
    val eventId: String,
    val currency: String,
    val revenueTotal: BigDecimal,
    val costTotal: BigDecimal = BigDecimal.ZERO,
    val profitTotal: BigDecimal = BigDecimal.ZERO,
    val creditConsumptionTotal: BigDecimal,
    val entryCount: Int
)
