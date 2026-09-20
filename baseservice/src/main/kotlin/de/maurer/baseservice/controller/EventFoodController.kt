package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.AddEventFoodRequest
import de.maurer.baseservice.dto.EventFoodDto
import de.maurer.baseservice.dto.UpdateEventFoodRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.EventFoodService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/v1/events/{eventId}/food")
@Tag(name = "Eventspeisen", description = "Eventbezogenes Speisenangebot mit individueller Preiskonfiguration")
class EventFoodController(
    private val eventFoodService: EventFoodService,
    private val authContext: AuthContext
) {

    private fun eventId(id: String) = Identifiers.parseUuid(id, "eventId")

    private fun eventFoodId(id: String) = Identifiers.parseUuid(id, "eventFoodId")

    @GetMapping
    @Operation(summary = "Eventspeisen auflisten", description = "Listet das Speisenangebot eines Events für berechtigte Benutzer")
    fun listEventFood(@PathVariable eventId: String): ResponseEntity<List<EventFoodDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(eventFoodService.listEventFood(eventId(eventId), principal))
    }

    @PostMapping
    @Operation(summary = "Eventspeise hinzufügen", description = "Fügt eine Speise aus dem Vereinskatalog dem Event hinzu (nur Owner sowie Vorstand/Admin)")
    fun addEventFood(
        @PathVariable eventId: String,
        @Valid @RequestBody request: AddEventFoodRequest
    ): ResponseEntity<EventFoodDto> {
        val principal = authContext.getRequiredPrincipal()
        val eventFood = eventFoodService.addEventFood(eventId(eventId), request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(eventFood)
    }

    @PutMapping("/{eventFoodId}")
    @Operation(summary = "Eventspeise aktualisieren", description = "Aktualisiert Preis, Einkaufspreis, Währung und Flags einer Eventspeise (nur Owner sowie Vorstand/Admin)")
    fun updateEventFood(
        @PathVariable eventId: String,
        @PathVariable("eventFoodId") eventFood: String,
        @Valid @RequestBody request: UpdateEventFoodRequest
    ): ResponseEntity<EventFoodDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(
            eventFoodService.updateEventFood(eventId(eventId), eventFoodId(eventFood), request, principal)
        )
    }

    @DeleteMapping("/{eventFoodId}")
    @Operation(summary = "Eventspeise entfernen", description = "Entfernt eine Speise aus dem Event (nur Owner sowie Vorstand/Admin)")
    fun removeEventFood(
        @PathVariable eventId: String,
        @PathVariable("eventFoodId") eventFood: String
    ): ResponseEntity<Void> {
        val principal = authContext.getRequiredPrincipal()
        eventFoodService.removeEventFood(eventId(eventId), eventFoodId(eventFood), principal)
        return ResponseEntity.noContent().build()
    }
}
