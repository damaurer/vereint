package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.EventDrinkService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/v1/events/{eventId}/drinks")
@Tag(name = "Eventgetränke", description = "Eventbezogene Getränkeauswahl und Zuweisung von Sublists")
class EventDrinkController(
    private val eventDrinkService: EventDrinkService,
    private val authContext: AuthContext
) {

    /**
     * Die API-Verträge liefern Kennungen als Zeichenkette; intern wird der native
     * UUID-Typ verwendet. Ungültige Eingaben werden hier in `400` überführt und
     * erreichen die Fachlogik nicht.
     */
    private fun eventId(id: String) = Identifiers.parseUuid(id, "eventId")

    private fun eventDrinkId(id: String) = Identifiers.parseUuid(id, "eventDrinkId")

    @GetMapping
    @Operation(summary = "Eventgetränke auflisten", description = "Listet die Getränkeauswahl eines Events für berechtigte Benutzer")
    fun listEventDrinks(@PathVariable eventId: String): ResponseEntity<List<EventDrinkDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(eventDrinkService.listEventDrinks(eventId(eventId), principal))
    }

    @PostMapping
    @Operation(summary = "Eventgetränk hinzufügen", description = "Fügt ein freigegebenes Getränk als Eventkopie hinzu (nur Owner sowie Vorstand/Admin)")
    fun addEventDrink(
        @PathVariable eventId: String,
        @Valid @RequestBody request: AddEventDrinkRequest
    ): ResponseEntity<EventDrinkDto> {
        val principal = authContext.getRequiredPrincipal()
        val eventDrink = eventDrinkService.addEventDrink(eventId(eventId), request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(eventDrink)
    }

    @PostMapping("/assign-sublist")
    @Operation(summary = "Sublist zuweisen", description = "Kopiert die Einträge einer Sublist in die Eventauswahl (nur Owner sowie Vorstand/Admin)")
    fun assignSublist(
        @PathVariable eventId: String,
        @Valid @RequestBody request: AssignSublistRequest
    ): ResponseEntity<List<EventDrinkDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(eventDrinkService.assignSublist(eventId(eventId), request, principal))
    }

    @PutMapping("/{eventDrinkId}")
    @Operation(summary = "Eventgetränk aktualisieren", description = "Aktualisiert Preis, Währung und Flags einer Eventkopie (nur Owner sowie Vorstand/Admin)")
    fun updateEventDrink(
        @PathVariable eventId: String,
        @PathVariable("eventDrinkId") eventDrink: String,
        @Valid @RequestBody request: UpdateEventDrinkRequest
    ): ResponseEntity<EventDrinkDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(
            eventDrinkService.updateEventDrink(eventId(eventId), eventDrinkId(eventDrink), request, principal)
        )
    }

    @DeleteMapping("/{eventDrinkId}")
    @Operation(summary = "Eventgetränk entfernen", description = "Entfernt eine Getränkekopie aus dem Event (nur Owner sowie Vorstand/Admin)")
    fun removeEventDrink(
        @PathVariable eventId: String,
        @PathVariable("eventDrinkId") eventDrink: String
    ): ResponseEntity<Void> {
        val principal = authContext.getRequiredPrincipal()
        eventDrinkService.removeEventDrink(eventId(eventId), eventDrinkId(eventDrink), principal)
        return ResponseEntity.noContent().build()
    }
}
