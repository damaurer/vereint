package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.MomentConfigService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * Moment-Typen und Reaktionen. Lesen dürfen alle Angemeldeten, anlegen und
 * ändern nur Vorstand und Administration (geprüft im [MomentConfigService]).
 */
@RestController
@RequestMapping("/api/v1/moment-config")
@Tag(name = "Moments", description = "Gemeinschaftsmomente & Rituale (Moments)")
class MomentConfigController(
    private val momentConfigService: MomentConfigService,
    private val authContext: AuthContext
) {

    @GetMapping
    @Operation(summary = "Moment-Typen und Reaktionen", description = "Alle Typen und Reaktionen inklusive ausgemusterter sowie die Upload-Grenzen")
    fun getConfig(): ResponseEntity<MomentConfigDto> {
        authContext.getRequiredPrincipal()
        return ResponseEntity.ok(momentConfigService.getConfig())
    }

    @PostMapping("/types")
    @Operation(summary = "Moment-Typ anlegen", description = "Nur Vorstand und Administration")
    fun createType(@Valid @RequestBody request: SaveMomentTypeRequest): ResponseEntity<MomentTypeDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.status(HttpStatus.CREATED).body(momentConfigService.createType(request, principal))
    }

    @PutMapping("/types/{id}")
    @Operation(summary = "Moment-Typ ändern oder ausmustern", description = "Nur Vorstand und Administration")
    fun updateType(@PathVariable id: String, @Valid @RequestBody request: SaveMomentTypeRequest): ResponseEntity<MomentTypeDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(momentConfigService.updateType(Identifiers.parseUuid(id, "id"), request, principal))
    }

    @PostMapping("/reactions")
    @Operation(summary = "Reaktion anlegen", description = "Nur Vorstand und Administration")
    fun createReaction(@Valid @RequestBody request: SaveMomentReactionRequest): ResponseEntity<MomentReactionDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.status(HttpStatus.CREATED).body(momentConfigService.createReaction(request, principal))
    }

    @PutMapping("/reactions/{id}")
    @Operation(summary = "Reaktion ändern oder ausmustern", description = "Nur Vorstand und Administration")
    fun updateReaction(@PathVariable id: String, @Valid @RequestBody request: SaveMomentReactionRequest): ResponseEntity<MomentReactionDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(momentConfigService.updateReaction(Identifiers.parseUuid(id, "id"), request, principal))
    }
}
