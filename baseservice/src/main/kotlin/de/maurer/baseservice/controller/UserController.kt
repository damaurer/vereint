package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.TermsService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.data.domain.Pageable
import org.springframework.data.web.PageableDefault
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/v1/users")
@Tag(name = "Users", description = "Benutzerprofile, Rollen- und Berechtigungsverwaltung")
class UserController(
    private val userService: UserService,
    private val termsService: TermsService,
    private val authContext: AuthContext
) {

    /**
     * Die API-Verträge liefern Kennungen als Zeichenkette; intern wird der
     * native UUID-Typ verwendet. Ungültige Eingaben werden hier in `400`
     * überführt und erreichen die Fachlogik nicht.
     */
    private fun userId(id: String) = Identifiers.parseUuid(id, "id")

    @GetMapping("/me")
    @Operation(summary = "Eigenes Benutzerprofil abrufen", description = "Gibt das aufgelöste Profil des aktuellen Benutzers zurück")
    fun getMyProfile(): ResponseEntity<UserProfileDto> {
        val principal = authContext.getRequiredPrincipal()
        val profile = userService.getProfile(principal)
        return ResponseEntity.ok(profile)
    }

    @PutMapping("/me")
    @Operation(summary = "Eigenes Benutzerprofil aktualisieren", description = "Aktualisiert Anzeigename oder Email des aktuellen Benutzers")
    fun updateMyProfile(@Valid @RequestBody request: UpdateProfileRequest): ResponseEntity<UserProfileDto> {
        val principal = authContext.getRequiredPrincipal()
        val profile = userService.updateProfile(principal, request)
        return ResponseEntity.ok(profile)
    }

    @GetMapping("/me/terms")
    @Operation(summary = "Stand der AGB-Zustimmung", description = "Gültige Fassung, zugestimmte Fassung und Zeitpunkt des eigenen Kontos")
    fun getMyTerms(): ResponseEntity<TermsStatusDto> =
        ResponseEntity.ok(termsService.status(authContext.getRequiredPrincipal()))

    @PostMapping("/me/terms")
    @Operation(summary = "Der gültigen AGB-Fassung zustimmen", description = "Speichert Fassung und Zeitpunkt der Zustimmung am eigenen Konto")
    fun acceptMyTerms(@RequestBody request: AcceptTermsRequest): ResponseEntity<TermsStatusDto> =
        ResponseEntity.ok(termsService.accept(authContext.getRequiredPrincipal(), request))

    @GetMapping
    @Operation(
        summary = "Benutzerliste abrufen",
        description = "Paginierte Benutzerübersicht für Vorstandsmitglieder und Administratoren"
    )
    fun listUsers(
        @RequestParam(required = false) role: String?,
        @RequestParam(required = false) disabled: Boolean?,
        @RequestParam(required = false) search: String?,
        @PageableDefault(size = UserService.DEFAULT_PAGE_SIZE, sort = ["displayName"]) pageable: Pageable
    ): ResponseEntity<PagedResponse<UserSummaryDto>> {
        val principal = authContext.getRequiredPrincipal()
        val users = userService.listUsers(
            role = role,
            disabled = disabled,
            search = search,
            pageable = pageable,
            principal = principal
        )
        return ResponseEntity.ok(users)
    }

    @GetMapping("/directory")
    @Operation(summary = "Mitgliederverzeichnis", description = "Aktive Mitglieder mit Namen und Rollen für Auswahllisten (alle Angemeldeten)")
    fun directory(): ResponseEntity<List<MemberDirectoryEntryDto>> =
        ResponseEntity.ok(userService.directory(authContext.getRequiredPrincipal()))

    @GetMapping("/{id}")
    @Operation(summary = "Benutzerprofil nach ID abrufen", description = "Liefert das Benutzerprofil für Administratoren oder den Eigentümer")
    fun getUserById(@PathVariable id: String): ResponseEntity<UserProfileDto> {
        val principal = authContext.getRequiredPrincipal()
        val profile = userService.getUserById(userId(id), principal)
        return ResponseEntity.ok(profile)
    }

    @PutMapping("/{id}")
    @Operation(summary = "Benutzerdaten administrativ aktualisieren", description = "Administrator-Funktion zur Aktualisierung von Profil, Rollen und Status")
    fun adminUpdateUser(
        @PathVariable id: String,
        @Valid @RequestBody request: AdminUpdateUserRequest
    ): ResponseEntity<UserProfileDto> {
        val principal = authContext.getRequiredPrincipal()
        val profile = userService.adminUpdateUser(userId(id), request, principal)
        return ResponseEntity.ok(profile)
    }

    @PutMapping("/{id}/roles")
    @Operation(summary = "Rollen eines Benutzers setzen", description = "Administrator-Funktion zum Zuweisen von Rollen")
    fun assignRoles(
        @PathVariable id: String,
        @Valid @RequestBody request: AssignRolesRequest
    ): ResponseEntity<UserProfileDto> {
        val principal = authContext.getRequiredPrincipal()
        val profile = userService.assignRoles(userId(id), request.roles, principal)
        return ResponseEntity.ok(profile)
    }

    @PutMapping("/{id}/permissions")
    @Operation(summary = "Permissions eines Benutzers setzen", description = "Administrator-Funktion zum Zuweisen spezifischer Permissions")
    fun assignPermissions(
        @PathVariable id: String,
        @Valid @RequestBody request: AssignPermissionsRequest
    ): ResponseEntity<UserProfileDto> {
        val principal = authContext.getRequiredPrincipal()
        val profile = userService.assignPermissions(userId(id), request.permissions, principal)
        return ResponseEntity.ok(profile)
    }

    @PutMapping("/{id}/status")
    @Operation(summary = "Benutzerstatus aktivieren oder deaktivieren", description = "Administrator-Funktion zum Deaktivieren/Aktivieren eines Benutzers")
    fun updateUserStatus(
        @PathVariable id: String,
        @Valid @RequestBody request: UpdateUserStatusRequest
    ): ResponseEntity<UserProfileDto> {
        val principal = authContext.getRequiredPrincipal()
        val profile = userService.setUserStatus(userId(id), request.disabled, principal)
        return ResponseEntity.ok(profile)
    }
}
