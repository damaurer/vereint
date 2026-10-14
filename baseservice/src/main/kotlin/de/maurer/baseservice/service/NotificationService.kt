package de.maurer.baseservice.service

import de.maurer.baseservice.domain.NotificationEntity
import de.maurer.baseservice.domain.PushSubscriptionEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.NotificationDto
import de.maurer.baseservice.dto.PushSubscriptionDto
import de.maurer.baseservice.dto.RegisterPushSubscriptionRequest
import de.maurer.baseservice.dto.SendNotificationRequest
import de.maurer.baseservice.dto.UnreadCountDto
import de.maurer.baseservice.dto.VapidPublicKeyDto
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.push.PushMessage
import de.maurer.baseservice.push.PushSender
import de.maurer.baseservice.push.PushDispatcher
import de.maurer.baseservice.repository.NotificationRepository
import de.maurer.baseservice.repository.PushSubscriptionRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.support.Identifiers
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Fachlicher Slice für Benachrichtigungen und Web-Push-Abonnements (TICKET-020).
 *
 * Jeder Zugriff wird serverseitig geprüft (`deny by default`): Mitglieder lesen
 * und quittieren ausschließlich die eigenen Benachrichtigungen und verwalten nur
 * die eigenen Push-Abonnements. Das Versenden einer Benachrichtigung an ein
 * Mitglied ist Vorstand und Administration vorbehalten. Push-Subscriptions sind
 * geschützte Fachdaten; ihre geheimen Schlüssel verlassen den Spring-Service nicht
 * (siehe `docs/architektur.md`, Abschnitt „Bilder und Push"). Der eigentliche
 * Versand erfolgt über die gekapselte [PushSender]-Abstraktion mit VAPID.
 */
@Service
@Transactional
class NotificationService(
    private val notificationRepository: NotificationRepository,
    private val pushSubscriptionRepository: PushSubscriptionRepository,
    private val userRepository: UserRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userService: UserService,
    private val pushSender: PushSender,
    private val pushDispatcher: PushDispatcher,
    private val auditService: AuditService
) {

    // --- Benachrichtigungen des Aufrufers ---

    @Transactional(readOnly = true)
    fun listOwnNotifications(principal: UserPrincipal): List<NotificationDto> {
        val caller = userService.getOrCreateUser(principal)
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(caller.id).map { toDto(it) }
    }

    @Transactional(readOnly = true)
    fun unreadCount(principal: UserPrincipal): UnreadCountDto {
        val caller = userService.getOrCreateUser(principal)
        return UnreadCountDto(notificationRepository.findByUserIdAndReadFalse(caller.id).size.toLong())
    }

    fun markRead(notificationId: UUID, principal: UserPrincipal): NotificationDto {
        val caller = userService.getOrCreateUser(principal)
        val notification = notificationRepository.findById(notificationId).orElseThrow {
            ResourceNotFoundException("Benachrichtigung mit ID '$notificationId' nicht gefunden", ErrorCode.NOT_FOUND)
        }
        // deny by default: fremde Benachrichtigungen werden nicht offengelegt
        if (notification.user?.id != caller.id) {
            throw ResourceNotFoundException(
                "Benachrichtigung mit ID '$notificationId' nicht gefunden",
                ErrorCode.NOT_FOUND
            )
        }
        if (!notification.read) {
            notification.read = true
            notificationRepository.save(notification)
        }
        return toDto(notification)
    }

    fun markAllRead(principal: UserPrincipal): UnreadCountDto {
        val caller = userService.getOrCreateUser(principal)
        val unread = notificationRepository.findByUserIdAndReadFalse(caller.id)
        unread.forEach { it.read = true }
        if (unread.isNotEmpty()) {
            notificationRepository.saveAll(unread)
        }
        return UnreadCountDto(0)
    }

    // --- Push-Abonnements des Aufrufers ---

    @Transactional(readOnly = true)
    fun listOwnSubscriptions(principal: UserPrincipal): List<PushSubscriptionDto> {
        val caller = userService.getOrCreateUser(principal)
        return pushSubscriptionRepository.findByUserId(caller.id).map { toDto(it) }
    }

    /**
     * Registriert ein Abonnement für den Aufrufer oder frischt es auf. Ein bereits
     * bekannter Endpoint (identisches Gerät) wird dem Aufrufer zugeordnet und mit
     * den aktuellen Schlüsseln aktualisiert.
     */
    fun registerSubscription(request: RegisterPushSubscriptionRequest, principal: UserPrincipal): PushSubscriptionDto {
        val caller = userService.getOrCreateUser(principal)
        val endpoint = require(request.endpoint, "endpoint")
        val p256dh = require(request.p256dh, "p256dh")
        val auth = require(request.auth, "auth")
        val userAgent = request.userAgent?.trim()?.ifBlank { null }

        val existing = pushSubscriptionRepository.findByEndpoint(endpoint).orElse(null)
        val subscription = existing ?: PushSubscriptionEntity(endpoint = endpoint)
        subscription.user = caller
        subscription.p256dh = p256dh
        subscription.auth = auth
        subscription.userAgent = userAgent
        return toDto(pushSubscriptionRepository.save(subscription))
    }

    fun deleteSubscription(subscriptionId: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val subscription = pushSubscriptionRepository.findById(subscriptionId).orElseThrow {
            ResourceNotFoundException("Abonnement mit ID '$subscriptionId' nicht gefunden", ErrorCode.NOT_FOUND)
        }
        if (subscription.user?.id != caller.id) {
            throw ResourceNotFoundException(
                "Abonnement mit ID '$subscriptionId' nicht gefunden",
                ErrorCode.NOT_FOUND
            )
        }
        pushSubscriptionRepository.delete(subscription)
    }

    @Transactional(readOnly = true)
    fun vapidPublicKey(): VapidPublicKeyDto =
        VapidPublicKeyDto(enabled = pushSender.isEnabled(), publicKey = pushSender.publicKey())

    // --- Versand (Vorstand/Administration) ---

    fun sendNotification(request: SendNotificationRequest, principal: UserPrincipal): NotificationDto {
        val caller = userService.getOrCreateUser(principal)
        requireBoardOrAdmin(caller, principal)

        val targetId = Identifiers.parseUuid(request.userId, "userId")
        val target = userRepository.findById(targetId).orElseThrow {
            ResourceNotFoundException("Benutzer mit ID '$targetId' nicht gefunden", ErrorCode.NOT_FOUND)
        }
        val title = require(request.title, "title")
        val body = require(request.body, "body")
        val type = request.type?.trim()?.ifBlank { null } ?: DEFAULT_TYPE

        val notification = notificationRepository.save(
            NotificationEntity(user = target, title = title, body = body, type = type)
        )

        pushDispatcher.dispatch(listOf(target.id), PushMessage(title = title, body = body, type = type))

        auditService.recordNotification(
            caller,
            AuditService.ACTION_NOTIFICATION_SENT,
            notification.id,
            "target=${target.id}; type=$type"
        )
        return toDto(notification)
    }

    /**
     * Interner Einstiegspunkt für andere Slices, um ein Mitglied zu benachrichtigen
     * (z. B. Einladungen, Ledger-Ereignisse). Speichert die Benachrichtigung und
     * stellt sie – sofern konfiguriert – nach dem Commit per Web Push zu.
     */
    fun notifyUser(target: UserEntity, title: String, body: String, type: String): NotificationEntity {
        val notification = notificationRepository.save(
            NotificationEntity(user = target, title = title, body = body, type = type)
        )
        pushDispatcher.dispatch(listOf(target.id), PushMessage(title = title, body = body, type = type))
        return notification
    }

    /**
     * Versendet eine Benachrichtigung an mehrere Empfänger (z. B. Event-Teilnehmer bei neuem Moment).
     */
    fun notifyUsers(targets: Collection<UserEntity>, title: String, body: String, type: String): List<NotificationEntity> {
        val notifications = targets.map {
            notificationRepository.save(NotificationEntity(user = it, title = title, body = body, type = type))
        }
        pushDispatcher.dispatch(targets.map { it.id }, PushMessage(title = title, body = body, type = type))
        return notifications
    }

    // --- Interne Helfer ---

    private fun requireBoardOrAdmin(caller: UserEntity, principal: UserPrincipal) {
        if (!isBoardOrAdmin(caller, principal)) {
            throw AccessDeniedException(
                "Nur Vorstand und Administration dürfen Benachrichtigungen versenden",
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean {
        val dbRoles = userRoleRepository.findByIdUserId(caller.id).map { it.id.role.name }
        val roles = principal.roles + dbRoles
        return roles.any { it == UserRole.BOARD || it == UserRole.ADMIN }
    }

    private fun require(value: String?, field: String): String {
        val text = value?.trim()
        if (text.isNullOrEmpty()) {
            throw InvalidRequestException("$field darf nicht leer sein", ErrorCode.INVALID_REQUEST)
        }
        return text
    }

    private fun toDto(notification: NotificationEntity): NotificationDto =
        NotificationDto(
            id = notification.id.toString(),
            title = notification.title,
            body = notification.body,
            type = notification.type,
            read = notification.read,
            createdAt = notification.createdAt
        )

    private fun toDto(subscription: PushSubscriptionEntity): PushSubscriptionDto =
        PushSubscriptionDto(
            id = subscription.id.toString(),
            endpoint = subscription.endpoint,
            userAgent = subscription.userAgent,
            createdAt = subscription.createdAt,
            updatedAt = subscription.updatedAt
        )

    companion object {
        const val DEFAULT_TYPE = "general"
    }
}
