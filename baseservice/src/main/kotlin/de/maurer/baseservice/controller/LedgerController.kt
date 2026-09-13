package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.LedgerService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * Öffentliche API für Ledger, Guthaben und Kassenbuchungen (TICKET-015).
 *
 * Kennungen werden nach außen als UUID-Zeichenkette geführt; ungültige Werte werden
 * am Rand in `400` überführt. Finanzielle Schreibvorgänge verlangen den Header
 * `Idempotency-Key`; die Autorisierung erfolgt serverseitig im [LedgerService].
 */
@RestController
@RequestMapping("/api/v1/ledger")
@Tag(name = "Ledger", description = "Guthaben, Ledger und Kassenbuchungen")
class LedgerController(
    private val ledgerService: LedgerService,
    private val authContext: AuthContext
) {

    private fun memberId(id: String) = Identifiers.parseUuid(id, "memberId")

    private fun eventId(id: String) = Identifiers.parseUuid(id, "eventId")

    @GetMapping("/members/{memberId}/balance")
    @Operation(summary = "Guthaben abrufen", description = "Liefert das Guthaben einer Person (eigenes bzw. für Vorstand/Admin beliebiges)")
    fun getBalance(@PathVariable("memberId") id: String): ResponseEntity<MemberBalanceDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(ledgerService.getMemberBalance(memberId(id), principal))
    }

    @GetMapping("/members/{memberId}/entries")
    @Operation(summary = "Kontoauszug abrufen", description = "Listet die Ledger-Buchungen einer Person in Buchungsreihenfolge")
    fun listEntries(@PathVariable("memberId") id: String): ResponseEntity<List<LedgerEntryDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(ledgerService.listMemberEntries(memberId(id), principal))
    }

    @GetMapping("/events/{eventId}/summary")
    @Operation(summary = "Eventabrechnung abrufen", description = "Aggregierte Umsatz- und Kassenkennzahlen eines Events (nur Vorstand/Admin)")
    fun getEventSummary(@PathVariable("eventId") id: String): ResponseEntity<EventLedgerSummaryDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(ledgerService.getEventSummary(eventId(id), principal))
    }

    @PostMapping("/purchases")
    @Operation(
        summary = "Barcodekauf ausführen",
        description = "Bucht einen idempotenten PWA-Barcodekauf für den angemeldeten Benutzer; Preis, Event, Getränk und Modus bestimmt der Server"
    )
    fun purchase(
        @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) idempotencyKey: String?,
        @Valid @RequestBody request: PurchaseRequest
    ): ResponseEntity<LedgerEntryDto> {
        val principal = authContext.getRequiredPrincipal()
        val entry = ledgerService.purchaseByBarcode(request, idempotencyKey, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(entry)
    }

    @PostMapping("/topups")
    @Operation(summary = "Guthaben aufladen", description = "Bucht eine idempotente Guthaben-Aufladung (nur Vorstand/Admin)")
    fun topup(
        @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) idempotencyKey: String?,
        @Valid @RequestBody request: TopupRequest
    ): ResponseEntity<LedgerEntryDto> {
        val principal = authContext.getRequiredPrincipal()
        val entry = ledgerService.topup(request, idempotencyKey, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(entry)
    }

    @PostMapping("/payouts")
    @Operation(summary = "Guthaben auszahlen", description = "Bucht eine idempotente Auszahlung (nur Vorstand/Admin)")
    fun payout(
        @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) idempotencyKey: String?,
        @Valid @RequestBody request: PayoutRequest
    ): ResponseEntity<LedgerEntryDto> {
        val principal = authContext.getRequiredPrincipal()
        val entry = ledgerService.payout(request, idempotencyKey, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(entry)
    }

    @PostMapping("/corrections")
    @Operation(summary = "Buchung korrigieren", description = "Erzeugt eine Gegenbuchung zu einer bestehenden Buchung (nur Vorstand/Admin)")
    fun correct(
        @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) idempotencyKey: String?,
        @Valid @RequestBody request: CorrectionRequest
    ): ResponseEntity<LedgerEntryDto> {
        val principal = authContext.getRequiredPrincipal()
        val entry = ledgerService.correct(request, idempotencyKey, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(entry)
    }

    companion object {
        const val IDEMPOTENCY_HEADER = "Idempotency-Key"
    }
}
