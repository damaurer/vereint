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
    @field:NotBlank(message = "endpoint darf nicht leer sein")
    @field:Size(max = 2048, message = "endpoint darf höchstens 2048 Zeichen lang sein")
    val endpoint: String? = null,

    @field:NotBlank(message = "p256dh darf nicht leer sein")
    @field:Size(max = 255, message = "p256dh darf höchstens 255 Zeichen lang sein")
    val p256dh: String? = null,

    @field:NotBlank(message = "auth darf nicht leer sein")
    @field:Size(max = 255, message = "auth darf höchstens 255 Zeichen lang sein")
    val auth: String? = null,

    @field:Size(max = 512, message = "userAgent darf höchstens 512 Zeichen lang sein")
    val userAgent: String? = null
)

/**
 * Anfrage von Vorstand/Administration, eine Benachrichtigung an ein Mitglied zu
 * senden. Der Server speichert sie und stellt sie – sofern konfiguriert – per
 * Web Push (VAPID) an alle Abonnements des Empfängers zu.
 */
data class SendNotificationRequest(
    @field:NotBlank(message = "userId darf nicht leer sein")
    val userId: String? = null,

    @field:NotBlank(message = "title darf nicht leer sein")
    @field:Size(max = 255, message = "title darf höchstens 255 Zeichen lang sein")
    val title: String? = null,

    @field:NotBlank(message = "body darf nicht leer sein")
    @field:Size(max = 4000, message = "body darf höchstens 4000 Zeichen lang sein")
    val body: String? = null,

    @field:Size(max = 64, message = "type darf höchstens 64 Zeichen lang sein")
    val type: String? = null
)

/** Öffentlicher VAPID-Schlüssel, den der Browser zum Abonnieren benötigt. */
data class VapidPublicKeyDto(
    val enabled: Boolean,
    val publicKey: String
)
