package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.CreateMemberInviteRequest
import de.maurer.baseservice.dto.CreateMemberInviteResponse
import de.maurer.baseservice.dto.JoinStammtischResponse
import de.maurer.baseservice.dto.MemberInviteDto
import de.maurer.baseservice.dto.MemberInvitePreviewDto
import de.maurer.baseservice.dto.MemberInviteTokenRequest
import de.maurer.baseservice.dto.RegisterMemberRequest
import de.maurer.baseservice.dto.RegisterMemberResponse
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.MemberInviteService
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
@RequestMapping("/api/v1/member-invites")
@Tag(name = "Member invites", description = "Einladungslinks zur Registrierung neuer Mitglieder")
class MemberInviteController(
    private val memberInviteService: MemberInviteService,
    private val authContext: AuthContext
) {

    @PostMapping
    @Operation(
        summary = "Einladungslink erzeugen",
        description = "Nur Vorstand und Administration; das Rohtoken wird nur einmalig ausgeliefert"
    )
    fun createInvite(@Valid @RequestBody request: CreateMemberInviteRequest): ResponseEntity<CreateMemberInviteResponse> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.status(HttpStatus.CREATED).body(memberInviteService.createInvite(request, principal))
    }

    @GetMapping
    @Operation(summary = "Einladungslinks auflisten", description = "Nur Vorstand und Administration; ohne Rohtoken")
    fun listInvites(): ResponseEntity<List<MemberInviteDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(memberInviteService.listInvites(principal))
    }

    @DeleteMapping("/{inviteId}")
    @Operation(summary = "Einladungslink widerrufen", description = "Nur Vorstand und Administration")
    fun revokeInvite(@PathVariable("inviteId") inviteId: String): ResponseEntity<MemberInviteDto> {
        val principal = authContext.getRequiredPrincipal()
        val id = Identifiers.parseUuid(inviteId, "inviteId")
        return ResponseEntity.ok(memberInviteService.revokeInvite(id, principal))
    }

    /** Öffentlich: prüft einen Link, ohne ihn zu verbrauchen. Token im Body, nie in der URL. */
    @PostMapping("/preview")
    @Operation(summary = "Einladungslink prüfen", description = "Öffentlich; liefert das Ablaufdatum eines gültigen Links")
    fun preview(@Valid @RequestBody request: MemberInviteTokenRequest): ResponseEntity<MemberInvitePreviewDto> =
        ResponseEntity.ok(memberInviteService.preview(request.token))

    /** Öffentlich: legt mit einem gültigen Link ein Mitgliedskonto an. */
    @PostMapping("/register")
    @Operation(
        summary = "Mit Einladungslink registrieren",
        description = "Öffentlich; legt ein Keycloak-Konto mit der Rolle member an und verbraucht eine Nutzung des Links"
    )
    fun register(@Valid @RequestBody request: RegisterMemberRequest): ResponseEntity<RegisterMemberResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(memberInviteService.register(request))

    /** Angemeldet: mit bestehendem Konto dem Stammtisch des Links beitreten. */
    @PostMapping("/join")
    @Operation(
        summary = "Mit Einladungslink beitreten",
        description = "Angemeldet; macht das bestehende Konto zum Mitglied des Stammtischs, zu dem der Link gehört"
    )
    fun join(@Valid @RequestBody request: MemberInviteTokenRequest): ResponseEntity<JoinStammtischResponse> =
        ResponseEntity.ok(memberInviteService.join(request.token, authContext.getRequiredPrincipal()))
}
