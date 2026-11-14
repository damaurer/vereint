package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.FriendContactDto
import de.maurer.baseservice.dto.FriendRequestRequest
import de.maurer.baseservice.dto.FriendsOverviewDto
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.FriendService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** Gruppenübergreifende Freundesliste. Läuft ohne gewählte Gruppe. */
@RestController
@RequestMapping("/api/v1/friends")
@Tag(name = "Freunde", description = "Freundesliste über alle Gruppen")
class FriendController(
    private val friendService: FriendService,
    private val authContext: AuthContext
) {

    @GetMapping
    @Operation(summary = "Freundesliste", description = "Freunde sowie offene Anfragen an mich und von mir")
    fun overview(): ResponseEntity<FriendsOverviewDto> =
        ResponseEntity.ok(friendService.overview(authContext.getRequiredPrincipal()))

    @GetMapping("/contacts")
    @Operation(summary = "Kontakte", description = "Personen aus den eigenen Gruppen und Freunde, mit gemeinsamen Gruppen")
    fun contacts(): ResponseEntity<List<FriendContactDto>> =
        ResponseEntity.ok(friendService.contacts(authContext.getRequiredPrincipal()))

    @PostMapping("/requests")
    @Operation(summary = "Freundschaftsanfrage senden", description = "Nur an Personen mit gemeinsamer Gruppe; eine Gegenanfrage gilt als angenommen")
    fun request(@Valid @RequestBody request: FriendRequestRequest): ResponseEntity<FriendContactDto> =
        ResponseEntity.ok(friendService.request(request.userId, authContext.getRequiredPrincipal()))

    @PostMapping("/requests/{userId}/accept")
    @Operation(summary = "Anfrage annehmen", description = "Nimmt die Freundschaftsanfrage dieser Person an")
    fun accept(@PathVariable userId: String): ResponseEntity<FriendContactDto> =
        ResponseEntity.ok(friendService.accept(userId, authContext.getRequiredPrincipal()))

    @DeleteMapping("/{userId}")
    @Operation(summary = "Entfernen", description = "Lehnt eine Anfrage ab, zieht die eigene zurück oder beendet die Freundschaft")
    fun remove(@PathVariable userId: String): ResponseEntity<Void> {
        friendService.remove(userId, authContext.getRequiredPrincipal())
        return ResponseEntity.noContent().build()
    }
}
