package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.AcceptInviteRequest
import de.maurer.baseservice.dto.AcceptInviteResponse
import de.maurer.baseservice.dto.CreateInviteRequest
import de.maurer.baseservice.dto.CreateInviteResponse
import de.maurer.baseservice.dto.InviteDto
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.InviteService
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

@RestController
@RequestMapping("/api/v1")
@Tag(name = "Invites", description = "Magic-Link-Einladungen und temporäre Gäste")
class InviteController(
    private val inviteService: InviteService,
    private val authContext: AuthContext
) {

    private fun eventId(id: String) = Identifiers.parseUuid(id, "eventId")

    private fun inviteId(id: String) = Identifiers.parseUuid(id, "inviteId")

    @PostMapping("/events/{eventId}/invites")
    @Operation(
        summary = "Einladung erzeugen",
        description = "Erzeugt einen zeitlich begrenzten, event-gebundenen Magic Link; das Rohtoken wird nur einmalig ausgeliefert"
    )
    fun createInvite(
        @PathVariable("eventId") eventIdValue: String,
        @Valid @RequestBody request: CreateInviteRequest
    ): ResponseEntity<CreateInviteResponse> {
        val principal = authContext.getRequiredPrincipal()
        val response = inviteService.createInvite(eventId(eventIdValue), request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(response)
    }

    @GetMapping("/events/{eventId}/invites")
    @Operation(
        summary = "Einladungen auflisten",
        description = "Listet die Einladungen eines Events ohne Rohtoken (nur Owner sowie Vorstand/Admin)"
    )
    fun listInvites(@PathVariable("eventId") eventIdValue: String): ResponseEntity<List<InviteDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(inviteService.listInvites(eventId(eventIdValue), principal))
    }

    @DeleteMapping("/events/{eventId}/invites/{inviteId}")
    @Operation(
        summary = "Einladung widerrufen",
        description = "Widerruft eine Einladung dauerhaft (nur Owner sowie Vorstand/Admin)"
    )
    fun revokeInvite(
        @PathVariable("eventId") eventIdValue: String,
        @PathVariable("inviteId") inviteIdValue: String
    ): ResponseEntity<Void> {
        val principal = authContext.getRequiredPrincipal()
        inviteService.revokeInvite(eventId(eventIdValue), inviteId(inviteIdValue), principal)
        return ResponseEntity.noContent().build()
    }

    /**
     * Öffentliche Einlösung eines Magic Links. Der Endpunkt ist bewusst ohne
     * Authentifizierung erreichbar; das Rohtoken selbst ist das Geheimnis.
     */
    @PostMapping("/invites/accept")
    @Operation(
        summary = "Einladung einlösen",
        description = "Löst einen Magic Link ein und liefert ein einmaliges Gast-Token für den eingeschränkten Eventkontext"
    )
    fun acceptInvite(@Valid @RequestBody request: AcceptInviteRequest): ResponseEntity<AcceptInviteResponse> {
        return ResponseEntity.status(HttpStatus.CREATED).body(inviteService.acceptInvite(request))
    }
}
