package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.dto.OpenStammtischRequest
import de.maurer.baseservice.dto.PlatformStammtischDto
import de.maurer.baseservice.dto.SaveStammtischRoleRequest
import de.maurer.baseservice.dto.StammtischDto
import de.maurer.baseservice.dto.StammtischMembershipDto
import de.maurer.baseservice.dto.StammtischRoleDto
import de.maurer.baseservice.dto.StammtischRolesDto
import de.maurer.baseservice.dto.StammtischSignupRequest
import de.maurer.baseservice.dto.StammtischSignupResponse
import de.maurer.baseservice.dto.UpdatePlatformStammtischRequest
import de.maurer.baseservice.dto.UpdateStammtischRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.GroupImageService
import de.maurer.baseservice.service.PlatformService
import de.maurer.baseservice.service.StammtischService
import de.maurer.baseservice.service.StammtischSignupService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile

/**
 * Stammtische einer Person, der aktuelle Stammtisch und seine Rollen.
 *
 * `/api/v1/stammtische` funktioniert ohne gewählten Stammtisch (Auswahl),
 * `/api/v1/stammtisch/...` gilt für den im Header gewählten Stammtisch.
 */
@RestController
@RequestMapping("/api/v1")
@Tag(name = "Stammtische", description = "Mitgliedschaften, Einstellungen und Rollen eines Stammtischs")
class StammtischController(
    private val stammtischService: StammtischService,
    private val signupService: StammtischSignupService,
    private val groupImageService: GroupImageService,
    private val authContext: AuthContext
) {

    @GetMapping("/stammtische")
    @Operation(summary = "Eigene Stammtische", description = "Alle Stammtische, in denen die Person aktives Mitglied ist")
    fun myStammtische(): ResponseEntity<List<StammtischMembershipDto>> =
        ResponseEntity.ok(stammtischService.myStammtische(authContext.getRequiredPrincipal()))

    @PostMapping("/stammtische")
    @Operation(
        summary = "Eigenen Stammtisch eröffnen",
        description = "Die Person wird Stammtisch-Admin des neuen Stammtischs"
    )
    fun openOwn(@Valid @RequestBody request: OpenStammtischRequest): ResponseEntity<StammtischMembershipDto> =
        ResponseEntity.status(HttpStatus.CREATED).body(signupService.openOwn(request, authContext.getRequiredPrincipal()))

    @PostMapping("/signup")
    @Operation(
        summary = "Registrieren und Stammtisch eröffnen",
        description = "Öffentlich: legt das Konto an und eröffnet den Stammtisch mit der Person als Stammtisch-Admin"
    )
    fun signup(@Valid @RequestBody request: StammtischSignupRequest): ResponseEntity<StammtischSignupResponse> =
        ResponseEntity.status(HttpStatus.CREATED).body(signupService.signup(request))

    @GetMapping("/stammtisch")
    @Operation(summary = "Aktueller Stammtisch")
    fun current(): ResponseEntity<StammtischDto> =
        ResponseEntity.ok(stammtischService.current(authContext.getRequiredPrincipal()))

    @PutMapping("/stammtisch")
    @Operation(summary = "Stammtisch umbenennen", description = "Erfordert stammtisch.manage")
    fun rename(@Valid @RequestBody request: UpdateStammtischRequest): ResponseEntity<StammtischDto> =
        ResponseEntity.ok(stammtischService.rename(request, authContext.getRequiredPrincipal()))

    @PostMapping("/stammtisch/leave")
    @Operation(summary = "Stammtisch verlassen", description = "Beendet die eigene Mitgliedschaft; Buchungen bleiben erhalten")
    fun leave(): ResponseEntity<Void> {
        stammtischService.leave(authContext.getRequiredPrincipal())
        return ResponseEntity.noContent().build()
    }

    @PutMapping("/stammtisch/image", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @Operation(summary = "Gruppenbild hochladen", description = "PNG, JPEG oder GIF bis 5 MB; erfordert stammtisch.manage")
    fun uploadImage(@RequestParam("file") file: MultipartFile): ResponseEntity<Map<String, Int>> {
        val version = groupImageService.upload(file.contentType, file.bytes, authContext.getRequiredPrincipal())
        return ResponseEntity.ok(mapOf("imageVersion" to version))
    }

    @DeleteMapping("/stammtisch/image")
    @Operation(summary = "Gruppenbild entfernen", description = "Erfordert stammtisch.manage")
    fun deleteImage(): ResponseEntity<Void> {
        groupImageService.delete(authContext.getRequiredPrincipal())
        return ResponseEntity.noContent().build()
    }

    @GetMapping("/stammtische/{id}/image")
    @Operation(summary = "Gruppenbild", description = "Für Mitglieder der Gruppe, auch wenn eine andere gewählt ist")
    fun image(@PathVariable("id") id: String): ResponseEntity<ByteArray> {
        val content = groupImageService.content(Identifiers.parseUuid(id, "id"), authContext.getRequiredPrincipal())
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(content.contentType))
            .header(HttpHeaders.CACHE_CONTROL, "private, max-age=86400")
            .header("X-Content-Type-Options", "nosniff")
            .body(content.data)
    }

    @GetMapping("/stammtisch/roles")
    @Operation(summary = "Rollen des Stammtischs", description = "Erfordert roles.manage oder members.read")
    fun roles(): ResponseEntity<StammtischRolesDto> =
        ResponseEntity.ok(stammtischService.roles(authContext.getRequiredPrincipal()))

    @PostMapping("/stammtisch/roles")
    @Operation(summary = "Eigene Rolle anlegen", description = "Erfordert roles.manage")
    fun createRole(@Valid @RequestBody request: SaveStammtischRoleRequest): ResponseEntity<StammtischRoleDto> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(stammtischService.createRole(request, authContext.getRequiredPrincipal()))

    @PutMapping("/stammtisch/roles/{id}")
    @Operation(summary = "Rolle ändern", description = "Name, Beschreibung, Reihenfolge und Berechtigungen; erfordert roles.manage")
    fun updateRole(
        @PathVariable("id") id: String,
        @Valid @RequestBody request: SaveStammtischRoleRequest
    ): ResponseEntity<StammtischRoleDto> =
        ResponseEntity.ok(stammtischService.updateRole(Identifiers.parseUuid(id, "id"), request, authContext.getRequiredPrincipal()))

    @DeleteMapping("/stammtisch/roles/{id}")
    @Operation(summary = "Eigene Rolle löschen", description = "Systemrollen lassen sich nicht löschen; erfordert roles.manage")
    fun deleteRole(@PathVariable("id") id: String): ResponseEntity<Void> {
        stammtischService.deleteRole(Identifiers.parseUuid(id, "id"), authContext.getRequiredPrincipal())
        return ResponseEntity.noContent().build()
    }
}

/** Plattform-Administration (Keycloak-Realm-Rolle `admin`): Stammtische anlegen und archivieren. */
@RestController
@RequestMapping("/api/v1/platform/stammtische")
@Tag(name = "Plattform", description = "Stammtische anlegen und verwalten (Plattform-Administration)")
class PlatformController(
    private val platformService: PlatformService,
    private val authContext: AuthContext
) {

    @GetMapping
    @Operation(summary = "Alle Stammtische")
    fun list(): ResponseEntity<List<PlatformStammtischDto>> =
        ResponseEntity.ok(platformService.list(authContext.getRequiredPrincipal()))

    @PostMapping
    @Operation(summary = "Stammtisch anlegen", description = "Mit Systemrollen und Moment-Startbestand; legt den ersten Admin fest")
    fun create(@Valid @RequestBody request: CreateStammtischRequest): ResponseEntity<PlatformStammtischDto> =
        ResponseEntity.status(HttpStatus.CREATED).body(platformService.create(request, authContext.getRequiredPrincipal()))

    @PutMapping("/{id}")
    @Operation(summary = "Stammtisch umbenennen oder archivieren")
    fun update(
        @PathVariable("id") id: String,
        @Valid @RequestBody request: UpdatePlatformStammtischRequest
    ): ResponseEntity<PlatformStammtischDto> =
        ResponseEntity.ok(platformService.update(Identifiers.parseUuid(id, "id"), request, authContext.getRequiredPrincipal()))
}
