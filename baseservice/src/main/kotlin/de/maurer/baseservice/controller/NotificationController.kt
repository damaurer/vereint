package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.BroadcastNotificationRequest
import de.maurer.baseservice.dto.BroadcastResultDto
import de.maurer.baseservice.dto.NotificationDto
import de.maurer.baseservice.dto.PushSubscriptionDto
import de.maurer.baseservice.dto.RegisterPushSubscriptionRequest
import de.maurer.baseservice.dto.SendNotificationRequest
import de.maurer.baseservice.dto.UnreadCountDto
import de.maurer.baseservice.dto.VapidPublicKeyDto
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.NotificationService
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
 * REST-Schnittstelle für Benachrichtigungen und Web-Push-Abonnements (TICKET-020).
 *
 * Alle Endpunkte erfordern eine authentifizierte Keycloak-Identität (JWT); die
 * fachlichen Prüfungen (`deny by default`) erfolgen im [NotificationService].
 * Dieser Controller übernimmt ausschließlich Bindung und Statuscodes.
 */
@RestController
@RequestMapping("/api/v1/notifications")
@Tag(name = "Notifications", description = "Benachrichtigungen und Web-Push-Abonnements")
class NotificationController(
    private val notificationService: NotificationService,
    private val authContext: AuthContext
) {

    @GetMapping
    @Operation(summary = "Eigene Benachrichtigungen abrufen", description = "Listet die Benachrichtigungen des angemeldeten Mitglieds")
    fun list(): ResponseEntity<List<NotificationDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(notificationService.listOwnNotifications(principal))
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Ungelesene Benachrichtigungen zählen", description = "Liefert die Anzahl ungelesener Benachrichtigungen des Aufrufers")
    fun unreadCount(): ResponseEntity<UnreadCountDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(notificationService.unreadCount(principal))
    }

    @PostMapping("/{notificationId}/read")
    @Operation(summary = "Benachrichtigung als gelesen markieren", description = "Markiert eine eigene Benachrichtigung als gelesen")
    fun markRead(@PathVariable("notificationId") notificationIdValue: String): ResponseEntity<NotificationDto> {
        val principal = authContext.getRequiredPrincipal()
        val id = Identifiers.parseUuid(notificationIdValue, "notificationId")
        return ResponseEntity.ok(notificationService.markRead(id, principal))
    }

    @PostMapping("/read-all")
    @Operation(summary = "Alle Benachrichtigungen als gelesen markieren", description = "Markiert alle eigenen Benachrichtigungen als gelesen")
    fun markAllRead(): ResponseEntity<UnreadCountDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(notificationService.markAllRead(principal))
    }

    @GetMapping("/vapid-public-key")
    @Operation(summary = "Öffentlichen VAPID-Schlüssel abrufen", description = "Liefert den öffentlichen VAPID-Schlüssel für das Browser-Abonnement")
    fun vapidPublicKey(): ResponseEntity<VapidPublicKeyDto> {
        authContext.getRequiredPrincipal()
        return ResponseEntity.ok(notificationService.vapidPublicKey())
    }

    @GetMapping("/subscriptions")
    @Operation(summary = "Eigene Push-Abonnements abrufen", description = "Listet die Push-Abonnements des Aufrufers ohne geheime Schlüssel")
    fun listSubscriptions(): ResponseEntity<List<PushSubscriptionDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(notificationService.listOwnSubscriptions(principal))
    }

    @PostMapping("/subscriptions")
    @Operation(summary = "Push-Abonnement registrieren", description = "Registriert oder aktualisiert ein Web-Push-Abonnement des Aufrufers")
    fun registerSubscription(
        @Valid @RequestBody request: RegisterPushSubscriptionRequest
    ): ResponseEntity<PushSubscriptionDto> {
        val principal = authContext.getRequiredPrincipal()
        val subscription = notificationService.registerSubscription(request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(subscription)
    }

    @DeleteMapping("/subscriptions/{subscriptionId}")
    @Operation(summary = "Push-Abonnement entfernen", description = "Entfernt ein eigenes Web-Push-Abonnement")
    fun deleteSubscription(@PathVariable("subscriptionId") subscriptionIdValue: String): ResponseEntity<Void> {
        val principal = authContext.getRequiredPrincipal()
        val id = Identifiers.parseUuid(subscriptionIdValue, "subscriptionId")
        notificationService.deleteSubscription(id, principal)
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/broadcast")
    @Operation(summary = "Rundbrief senden", description = "Benachrichtigt ausgewählte oder alle aktiven Mitglieder (nur Vorstand/Administration)")
    fun broadcast(@Valid @RequestBody request: BroadcastNotificationRequest): ResponseEntity<BroadcastResultDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.status(HttpStatus.CREATED).body(notificationService.broadcast(request, principal))
    }

    @PostMapping
    @Operation(summary = "Benachrichtigung senden", description = "Sendet eine Benachrichtigung an ein Mitglied (Vorstand und Administration)")
    fun send(@Valid @RequestBody request: SendNotificationRequest): ResponseEntity<NotificationDto> {
        val principal = authContext.getRequiredPrincipal()
        val notification = notificationService.sendNotification(request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(notification)
    }
}
