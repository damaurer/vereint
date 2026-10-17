package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.NotificationDto
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.PersonalAlertService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** Persönliche Mitteilungen (Direktnachrichten, Freunde) für Web Push. Läuft ohne gewählte Gruppe. */
@RestController
@RequestMapping("/api/v1/personal-notifications")
@Tag(name = "Persönliche Mitteilungen", description = "Gruppenübergreifende Mitteilungen für Web Push")
class PersonalNotificationController(
    private val personalAlertService: PersonalAlertService,
    private val authContext: AuthContext
) {

    @GetMapping
    @Operation(
        summary = "Persönliche Mitteilungen",
        description = "Ungelesene Direktnachrichten, offene Freundschaftsanfragen und frisch angenommene Freundschaften, neueste zuerst"
    )
    fun list(): ResponseEntity<List<NotificationDto>> =
        ResponseEntity.ok(personalAlertService.alerts(authContext.getRequiredPrincipal()))
}
