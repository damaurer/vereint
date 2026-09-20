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
    @field:NotBlank(message = "memberId darf nicht leer sein")
    val memberId: String? = null,

    @field:NotNull(message = "amount ist erforderlich")
    @field:DecimalMin(value = "0.01", message = "amount muss größer als 0 sein")
    @field:Digits(integer = 8, fraction = 2, message = "amount darf höchstens zwei Nachkommastellen haben")
    val amount: BigDecimal? = null,

    @field:Pattern(regexp = CURRENCY_PATTERN, message = "currency muss ein dreistelliger ISO-4217-Code sein")
    val currency: String? = null,

    @field:Size(max = 255, message = "note darf höchstens 255 Zeichen lang sein")
    val note: String? = null
)

/** Guthaben-Auszahlung (`payout`). */
data class PayoutRequest(
    @field:NotBlank(message = "memberId darf nicht leer sein")
    val memberId: String? = null,

    @field:NotNull(message = "amount ist erforderlich")
    @field:DecimalMin(value = "0.01", message = "amount muss größer als 0 sein")
    @field:Digits(integer = 8, fraction = 2, message = "amount darf höchstens zwei Nachkommastellen haben")
    val amount: BigDecimal? = null,

    @field:Pattern(regexp = CURRENCY_PATTERN, message = "currency muss ein dreistelliger ISO-4217-Code sein")
    val currency: String? = null,

    @field:Size(max = 255, message = "note darf höchstens 255 Zeichen lang sein")
    val note: String? = null
)

/** Korrektur einer bestehenden Buchung als Gegenbuchung. */
data class CorrectionRequest(
    @field:NotBlank(message = "originalEntryId darf nicht leer sein")
    val originalEntryId: String? = null,

    @field:Size(max = 255, message = "reason darf höchstens 255 Zeichen lang sein")
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
    @field:NotBlank(message = "eventId darf nicht leer sein")
    val eventId: String? = null,

    @field:NotBlank(message = "barcode darf nicht leer sein")
    @field:Size(max = 128, message = "barcode darf höchstens 128 Zeichen lang sein")
    val barcode: String? = null
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
    val snapshot: PurchaseSnapshotDto?
)

/**
 * Guthaben und Umsatzkennzahlen einer Person.
 *
 * `creditBalance` = Topups − Payouts − Kredit-Käufe ± Korrekturen. Käufe im Modus
 * `revenueOnly` verändern das Guthaben nicht, erhöhen aber den Umsatz.
 */
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
