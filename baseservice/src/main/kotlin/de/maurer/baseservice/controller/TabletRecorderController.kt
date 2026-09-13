package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.EventDrinkDto
import de.maurer.baseservice.dto.LedgerEntryDto
import de.maurer.baseservice.dto.TabletEventDto
import de.maurer.baseservice.dto.TabletMemberDto
import de.maurer.baseservice.dto.TabletPurchaseRequest
import de.maurer.baseservice.dto.TabletRevenuePurchaseRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.TabletRecorderService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * Öffentliche API für die Tablet-Erfassung und den Drink-Recorder (TICKET-017).
 *
 * Der Tablet-Kontext liest aktive Events, deren Mitglieder und die tabletfähigen
 * Eventgetränke und erfasst manuelle Käufe über die Strichliste. Kennungen werden
 * nach außen als UUID-Zeichenkette geführt; ungültige Werte werden am Rand in `400`
 * überführt. Der Kauf verlangt den Header `Idempotency-Key`; die gesamte
 * Autorisierung (`purchase.tablet`, `deny by default`) erfolgt serverseitig im
 * [TabletRecorderService].
 */
@RestController
@RequestMapping("/api/v1/tablet")
@Tag(name = "Tablet", description = "Tablet-Erfassung und Drink-Recorder")
class TabletRecorderController(
    private val tabletRecorderService: TabletRecorderService,
    private val authContext: AuthContext
) {

    private fun eventId(id: String) = Identifiers.parseUuid(id, "eventId")

    @GetMapping("/events")
    @Operation(summary = "Aktive Events auflisten", description = "Listet die aktiven Events für die Tablet-Auswahl")
    fun listEvents(): ResponseEntity<List<TabletEventDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(tabletRecorderService.listActiveEvents(principal))
    }

    @GetMapping("/events/{eventId}/members")
    @Operation(summary = "Eventmitglieder auflisten", description = "Listet die für die Strichliste freigegebenen Eventmitglieder")
    fun listMembers(@PathVariable("eventId") id: String): ResponseEntity<List<TabletMemberDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(tabletRecorderService.listEventMembers(eventId(id), principal))
    }

    @GetMapping("/events/{eventId}/drinks")
    @Operation(summary = "Eventgetränke auflisten", description = "Listet die tabletfähigen Eventgetränke der Auswahl")
    fun listDrinks(@PathVariable("eventId") id: String): ResponseEntity<List<EventDrinkDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(tabletRecorderService.listTabletDrinks(eventId(id), principal))
    }

    @PostMapping("/events/{eventId}/purchases")
    @Operation(summary = "Manuellen Kauf erfassen", description = "Erfasst einen idempotenten manuellen Strichlisten-Kauf (nur Tablet-Recorder)")
    fun recordPurchase(
        @PathVariable("eventId") id: String,
        @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) idempotencyKey: String?,
        @Valid @RequestBody request: TabletPurchaseRequest
    ): ResponseEntity<LedgerEntryDto> {
        val principal = authContext.getRequiredPrincipal()
        val entry = tabletRecorderService.recordPurchase(eventId(id), request, idempotencyKey, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(entry)
    }

    @PostMapping("/events/{eventId}/rounds")
    @Operation(
        summary = "Runde erfassen",
        description = "Bucht eine idempotente Runde als Revenue-Only für die angegebenen Eventmitglieder (nur Tablet-Recorder)"
    )
    fun recordRound(
        @PathVariable("eventId") id: String,
        @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) idempotencyKey: String?,
        @Valid @RequestBody request: TabletRevenuePurchaseRequest
    ): ResponseEntity<List<LedgerEntryDto>> {
        val principal = authContext.getRequiredPrincipal()
        val entries = tabletRecorderService.recordRound(eventId(id), request, idempotencyKey, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(entries)
    }

    @PostMapping("/events/{eventId}/evening")
    @Operation(
        summary = "Abendaktion erfassen",
        description = "Bucht eine idempotente Abendaktion als Revenue-Only für die angegebenen Eventmitglieder (nur Tablet-Recorder)"
    )
    fun recordEvening(
        @PathVariable("eventId") id: String,
        @RequestHeader(value = IDEMPOTENCY_HEADER, required = false) idempotencyKey: String?,
        @Valid @RequestBody request: TabletRevenuePurchaseRequest
    ): ResponseEntity<List<LedgerEntryDto>> {
        val principal = authContext.getRequiredPrincipal()
        val entries = tabletRecorderService.recordEvening(eventId(id), request, idempotencyKey, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(entries)
    }

    companion object {
        const val IDEMPOTENCY_HEADER = "Idempotency-Key"
    }
}
