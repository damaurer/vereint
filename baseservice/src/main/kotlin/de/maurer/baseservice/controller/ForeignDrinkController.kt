package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.ForeignDrinkDto
import de.maurer.baseservice.dto.ForeignDrinkRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.ForeignDrinkService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Fremdgetränke (Issue #110): ein gescanntes Getränk nur für die Statistik,
 * ohne Buchung und ohne Event. Regeln im [ForeignDrinkService].
 */
@RestController
@RequestMapping("/api/v1/statistics/foreign-drinks")
@Tag(name = "Statistik", description = "Statistik der Gruppe und eigene Statistik")
class ForeignDrinkController(
    private val foreignDrinkService: ForeignDrinkService,
    private val authContext: AuthContext
) {

    @PostMapping
    @Operation(
        summary = "Fremdgetränk erfassen",
        description = "Erfasst ein gescanntes Getränk nur in der Statistik (ohne Buchung, ohne Event); nur außerhalb eines laufenden Events mit Selbstbedienung und bei eingeschalteter Statistik"
    )
    fun record(
        @RequestHeader(value = LedgerController.IDEMPOTENCY_HEADER, required = false) idempotencyKey: String?,
        @Valid @RequestBody request: ForeignDrinkRequest
    ): ResponseEntity<ForeignDrinkDto> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(foreignDrinkService.record(request, idempotencyKey, authContext.getRequiredPrincipal()))

    @DeleteMapping("/{id}")
    @Operation(
        summary = "Eigenes Fremdgetränk entfernen",
        description = "Entfernt ein eigenes Fremdgetränk innerhalb von 10 Minuten nach dem Erfassen"
    )
    fun remove(@PathVariable("id") id: String): ResponseEntity<Void> {
        foreignDrinkService.remove(Identifiers.parseUuid(id, "id"), authContext.getRequiredPrincipal())
        return ResponseEntity.noContent().build()
    }
}
