package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.DrinkSublistService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/v1/sublists")
@Tag(name = "Sublists", description = "Wiederverwendbare Getränke-Sublists und deren Einträge")
class DrinkSublistController(
    private val drinkSublistService: DrinkSublistService,
    private val authContext: AuthContext
) {

    /**
     * Die API-Verträge liefern Kennungen als Zeichenkette; intern wird der native
     * UUID-Typ verwendet. Ungültige Eingaben werden hier in `400` überführt und
     * erreichen die Fachlogik nicht.
     */
    private fun sublistId(id: String) = Identifiers.parseUuid(id, "sublistId")

    private fun itemId(id: String) = Identifiers.parseUuid(id, "itemId")

    @GetMapping
    @Operation(summary = "Sublists auflisten", description = "Listet die eigenen Sublists (Vorstand/Admin sehen alle)")
    fun listSublists(): ResponseEntity<List<SublistSummaryDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(drinkSublistService.listSublists(principal))
    }

    @GetMapping("/{id}")
    @Operation(summary = "Sublist abrufen", description = "Liefert eine Sublist inklusive Einträge (Ersteller sowie Vorstand/Admin)")
    fun getSublist(@PathVariable id: String): ResponseEntity<SublistDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(drinkSublistService.getSublist(sublistId(id), principal))
    }

    @PostMapping
    @Operation(summary = "Sublist anlegen", description = "Legt eine neue Sublist mit dem aktuellen Benutzer als Ersteller an")
    fun createSublist(@Valid @RequestBody request: CreateSublistRequest): ResponseEntity<SublistDto> {
        val principal = authContext.getRequiredPrincipal()
        val sublist = drinkSublistService.createSublist(request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(sublist)
    }

    @PutMapping("/{id}")
    @Operation(summary = "Sublist aktualisieren", description = "Aktualisiert Name und Beschreibung (Ersteller sowie Vorstand/Admin)")
    fun updateSublist(
        @PathVariable id: String,
        @Valid @RequestBody request: UpdateSublistRequest
    ): ResponseEntity<SublistDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(drinkSublistService.updateSublist(sublistId(id), request, principal))
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Sublist löschen", description = "Löscht eine Sublist samt Einträgen (Ersteller sowie Vorstand/Admin)")
    fun deleteSublist(@PathVariable id: String): ResponseEntity<Void> {
        val principal = authContext.getRequiredPrincipal()
        drinkSublistService.deleteSublist(sublistId(id), principal)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{id}/items")
    @Operation(summary = "Sublist-Eintrag hinzufügen", description = "Fügt ein freigegebenes Getränk mit optionalem Vorschlagspreis hinzu")
    fun addItem(
        @PathVariable id: String,
        @Valid @RequestBody request: AddSublistItemRequest
    ): ResponseEntity<SublistItemDto> {
        val principal = authContext.getRequiredPrincipal()
        val item = drinkSublistService.addItem(sublistId(id), request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(item)
    }

    @DeleteMapping("/{id}/items/{itemId}")
    @Operation(summary = "Sublist-Eintrag entfernen", description = "Entfernt einen Eintrag aus der Sublist (Ersteller sowie Vorstand/Admin)")
    fun removeItem(
        @PathVariable id: String,
        @PathVariable("itemId") item: String
    ): ResponseEntity<Void> {
        val principal = authContext.getRequiredPrincipal()
        drinkSublistService.removeItem(sublistId(id), itemId(item), principal)
        return ResponseEntity.noContent().build()
    }
}
