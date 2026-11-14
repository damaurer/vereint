package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.CreateRoundRequest
import de.maurer.baseservice.dto.RoundDto
import de.maurer.baseservice.dto.RoundOptionsDto
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.RoundService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * Runden am eigenen Handy (Issue #81). Ausgeben und beenden nur am eigenen
 * Konto; das Thekenterminal liest die Runden nur.
 */
@RestController
@RequestMapping("/api/v1/events/{eventId}/rounds")
@Tag(name = "Runden", description = "Runde oder ganzen Abend mit dem eigenen Guthaben ausgeben")
class RoundController(
    private val roundService: RoundService,
    private val authContext: AuthContext
) {

    private fun eventId(id: String) = Identifiers.parseUuid(id, "eventId")

    @GetMapping
    @Operation(summary = "Runden des Events", description = "Alle Runden mit Verbrauch und Eingeladenen (Eventmitglieder und Thekenterminal)")
    fun list(@PathVariable eventId: String): ResponseEntity<List<RoundDto>> =
        ResponseEntity.ok(roundService.list(eventId(eventId), authContext.getRequiredPrincipal()))

    @GetMapping("/options")
    @Operation(summary = "Formular Runde ausgeben", description = "Eigenes Guthaben, Getränke mit Preis und Personen des laufenden Events")
    fun options(@PathVariable eventId: String): ResponseEntity<RoundOptionsDto> =
        ResponseEntity.ok(roundService.options(eventId(eventId), authContext.getRequiredPrincipal()))

    @PostMapping
    @Operation(summary = "Runde ausgeben", description = "Startet eine Runde oder einen ganzen Abend; abgebucht wird erst an der Theke")
    fun create(
        @PathVariable eventId: String,
        @Valid @RequestBody request: CreateRoundRequest
    ): ResponseEntity<RoundDto> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(roundService.create(eventId(eventId), request, authContext.getRequiredPrincipal()))

    @PostMapping("/{roundId}/end")
    @Operation(summary = "Runde beenden", description = "Beendet die eigene Runde vorzeitig")
    fun end(@PathVariable eventId: String, @PathVariable roundId: String): ResponseEntity<RoundDto> =
        ResponseEntity.ok(
            roundService.end(eventId(eventId), Identifiers.parseUuid(roundId, "roundId"), authContext.getRequiredPrincipal())
        )
}
