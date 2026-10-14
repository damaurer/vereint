package de.maurer.baseservice.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant

/**
 * Öffentliche Sicht auf eine gespeicherte Benachrichtigung (TICKET-020).
 *
 * Enthält ausschließlich für den Empfänger bestimmte, bereits serverseitig
 * autorisierte Daten. Empfängerbezug (`userId`) wird nicht ausgegeben, weil die
 * Liste stets die eigene ist.
 */
data class NotificationDto(
    val id: String,
    val title: String,
    val body: String,
    val type: String,
    val read: Boolean,
    val createdAt: Instant
)

/** Anzahl ungelesener Benachrichtigungen des Aufrufers. */
data class UnreadCountDto(
    val unread: Long
)

/**
 * Öffentliche Sicht auf ein Push-Abonnement. Die geheimen Schlüssel (`p256dh`,
 * `auth`) werden bewusst nicht ausgegeben; sie verlassen den Spring-Service nicht.
 */
data class PushSubscriptionDto(
    val id: String,
    val endpoint: String,
    val userAgent: String?,
    val createdAt: Instant,
    val updatedAt: Instant
)

/**
 * Anfrage zum Registrieren oder Auffrischen eines Web-Push-Abonnements. Endpoint
 * und Schlüssel stammen aus der Browser-`PushSubscription`; das Abonnement gehört
 * immer dem angemeldeten Aufrufer.
 */
data class RegisterPushSubscriptionRequest(
    @field:NotBlank(message = "endpoint {validation.notBlank}")
    @field:Size(max = 2048, message = "endpoint {validation.size.max}")
    val endpoint: String? = null,

    @field:NotBlank(message = "p256dh {validation.notBlank}")
    @field:Size(max = 255, message = "p256dh {validation.size.max}")
    val p256dh: String? = null,

    @field:NotBlank(message = "auth {validation.notBlank}")
    @field:Size(max = 255, message = "auth {validation.size.max}")
    val auth: String? = null,

    @field:Size(max = 512, message = "userAgent {validation.size.max}")
    val userAgent: String? = null
)

/**
 * Anfrage von Vorstand/Administration, eine Benachrichtigung an ein Mitglied zu
 * senden. Der Server speichert sie und stellt sie – sofern konfiguriert – per
 * Web Push (VAPID) an alle Abonnements des Empfängers zu.
 */
data class SendNotificationRequest(
    @field:NotBlank(message = "userId {validation.notBlank}")
    val userId: String? = null,

    @field:NotBlank(message = "title {validation.notBlank}")
    @field:Size(max = 255, message = "title {validation.size.max}")
    val title: String? = null,

    @field:NotBlank(message = "body {validation.notBlank}")
    @field:Size(max = 4000, message = "body {validation.size.max}")
    val body: String? = null,

    @field:Size(max = 64, message = "type {validation.size.max}")
    val type: String? = null
)

/** Öffentlicher VAPID-Schlüssel, den der Browser zum Abonnieren benötigt. */
data class VapidPublicKeyDto(
    val enabled: Boolean,
    val publicKey: String
)
