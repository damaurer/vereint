package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.DrinkWithMeSessionDto
import de.maurer.baseservice.dto.StartDrinkWithMeRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.DrinkWithMeService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * REST-Schnittstelle für DrinkWithMe-Sessions und Standortfreigaben (TICKET-021).
 *
 * Mitglieder greifen mit ihrer Keycloak-Identität (JWT) zu; alle fachlichen
 * Prüfungen (`deny by default`, Zustimmung, Ablauf, Sichtbarkeit, Widerruf)
 * erfolgen im [DrinkWithMeService]. Dieser Controller übernimmt ausschließlich
 * Bindung und Statuscodes.
 */
@RestController
@RequestMapping("/api/v1/events/{eventId}/drink-with-me")
@Tag(name = "DrinkWithMe", description = "Zeitlich begrenzte DrinkWithMe-Sessions und Standortfreigaben")
class DrinkWithMeController(
    private val drinkWithMeService: DrinkWithMeService,
    private val authContext: AuthContext
) {

    private fun eventId(id: String) = Identifiers.parseUuid(id, "eventId")

    private fun sessionId(id: String) = Identifiers.parseUuid(id, "sessionId")

    @GetMapping
    @Operation(summary = "Aktive Sessions abrufen", description = "Listet die aktiven DrinkWithMe-Sessions des Events für berechtigte Teilnehmer")
    fun listSessions(@PathVariable("eventId") eventIdValue: String): ResponseEntity<List<DrinkWithMeSessionDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(drinkWithMeService.listActiveSessions(eventId(eventIdValue), principal))
    }

    @PostMapping
    @Operation(summary = "Session starten", description = "Startet eine zeitlich begrenzte DrinkWithMe-Session mit ausdrücklicher Zustimmung")
    fun startSession(
        @PathVariable("eventId") eventIdValue: String,
        @Valid @RequestBody request: StartDrinkWithMeRequest
    ): ResponseEntity<DrinkWithMeSessionDto> {
        val principal = authContext.getRequiredPrincipal()
        val session = drinkWithMeService.startSession(eventId(eventIdValue), request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(session)
    }

    @DeleteMapping("/{sessionId}")
    @Operation(summary = "Session widerrufen", description = "Widerruft eine DrinkWithMe-Session (Eigentümer oder Vorstand/Administration)")
    fun revokeSession(
        @PathVariable("eventId") eventIdValue: String,
        @PathVariable("sessionId") sessionIdValue: String
    ): ResponseEntity<DrinkWithMeSessionDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(
            drinkWithMeService.revokeSession(eventId(eventIdValue), sessionId(sessionIdValue), principal)
        )
    }
}
