package de.maurer.baseservice

import de.maurer.baseservice.domain.NotificationEntity
import de.maurer.baseservice.domain.PushSubscriptionEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.RegisterPushSubscriptionRequest
import de.maurer.baseservice.dto.SendNotificationRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.push.PushDispatcher
import de.maurer.baseservice.push.PushMessage
import de.maurer.baseservice.push.PushSender
import de.maurer.baseservice.push.PushTarget
import de.maurer.baseservice.repository.NotificationRepository
import de.maurer.baseservice.repository.PushSubscriptionRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.AuditService
import de.maurer.baseservice.service.NotificationService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.support.StammtischTestSupport
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.ArgumentMatchers.any
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.junit.jupiter.MockitoSettings
import org.mockito.quality.Strictness
import java.util.*

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class NotificationServiceTest {

    @Mock
    private lateinit var notificationRepository: NotificationRepository

    @Mock
    private lateinit var pushSubscriptionRepository: PushSubscriptionRepository

    @Mock
    private lateinit var userRepository: UserRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    @Mock
    private lateinit var pushSender: PushSender

    @Mock
    private lateinit var pushDispatcher: PushDispatcher

    @Mock
    private lateinit var auditService: AuditService

    private lateinit var service: NotificationService

    private val callerId: UUID = UUID.randomUUID()
    private val otherId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        service = NotificationService(
            notificationRepository,
            pushSubscriptionRepository,
            StammtischTestSupport.members(userRepository),
            StammtischTestSupport.access(userRoleRepository),
            userService,
            pushSender,
            pushDispatcher,
            auditService
        )
        `when`(userRoleRepository.findByIdUserId(any(UUID::class.java) ?: callerId)).thenReturn(emptyList())
    }

    private fun caller() = UserEntity(id = callerId, keycloakSubject = "sub-caller", displayName = "Caller")
    private fun other() = UserEntity(id = otherId, keycloakSubject = "sub-other", displayName = "Other")

    private fun anyNotification(): NotificationEntity =
        any(NotificationEntity::class.java) ?: NotificationEntity()

    private fun anyTarget(): PushTarget = any(PushTarget::class.java) ?: PushTarget("", "", "", "")
    private fun anyMessage(): PushMessage = any(PushMessage::class.java) ?: PushMessage("", "", "")

    @Test
    fun `listOwnNotifications returns only the callers notifications`() {
        val caller = caller()
        val principal = UserPrincipal(subject = "sub-caller", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(caller)
        `when`(notificationRepository.findByUserIdOrderByCreatedAtDesc(callerId)).thenReturn(
            listOf(NotificationEntity(user = caller, title = "Hallo", body = "Text", type = "general"))
        )

        val result = service.listOwnNotifications(principal)

        assertEquals(1, result.size)
        assertEquals("Hallo", result[0].title)
    }

    @Test
    fun `markRead hides a foreign notification with not found`() {
        val caller = caller()
        val principal = UserPrincipal(subject = "sub-caller", roles = setOf(UserRole.MEMBER))
        val foreign = NotificationEntity(user = other(), title = "Fremd", body = "Text", type = "general")
        `when`(userService.getOrCreateUser(principal)).thenReturn(caller)
        `when`(notificationRepository.findById(foreign.id)).thenReturn(Optional.of(foreign))

        val ex = assertThrows(ResourceNotFoundException::class.java) {
            service.markRead(foreign.id, principal)
        }
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode)
        verify(notificationRepository, never()).save(anyNotification())
    }

    @Test
    fun `markRead marks the callers own notification`() {
        val caller = caller()
        val principal = UserPrincipal(subject = "sub-caller", roles = setOf(UserRole.MEMBER))
        val own = NotificationEntity(user = caller, title = "Hallo", body = "Text", type = "general")
        `when`(userService.getOrCreateUser(principal)).thenReturn(caller)
        `when`(notificationRepository.findById(own.id)).thenReturn(Optional.of(own))
        `when`(notificationRepository.save(anyNotification())).thenAnswer { it.arguments[0] }

        val dto = service.markRead(own.id, principal)

        assertTrue(dto.read)
        verify(notificationRepository).save(anyNotification())
    }

    @Test
    fun `registerSubscription creates a new subscription for the caller`() {
        val caller = caller()
        val principal = UserPrincipal(subject = "sub-caller", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(caller)
        `when`(pushSubscriptionRepository.findByEndpoint("https://push.example/abc")).thenReturn(Optional.empty())
        `when`(pushSubscriptionRepository.save(any(PushSubscriptionEntity::class.java) ?: PushSubscriptionEntity()))
            .thenAnswer { it.arguments[0] }

        val dto = service.registerSubscription(
            RegisterPushSubscriptionRequest(
                endpoint = "https://push.example/abc",
                p256dh = "key-p256dh",
                auth = "key-auth",
                userAgent = "Firefox"
            ),
            principal
        )

        assertEquals("https://push.example/abc", dto.endpoint)
        assertEquals("Firefox", dto.userAgent)
    }

    @Test
    fun `registerSubscription reassigns an existing endpoint to the caller`() {
        val caller = caller()
        val principal = UserPrincipal(subject = "sub-caller", roles = setOf(UserRole.MEMBER))
        val existing = PushSubscriptionEntity(
            endpoint = "https://push.example/abc",
            p256dh = "old",
            auth = "old",
            user = other()
        )
        `when`(userService.getOrCreateUser(principal)).thenReturn(caller)
        `when`(pushSubscriptionRepository.findByEndpoint("https://push.example/abc")).thenReturn(Optional.of(existing))
        `when`(pushSubscriptionRepository.save(any(PushSubscriptionEntity::class.java) ?: PushSubscriptionEntity()))
            .thenAnswer { it.arguments[0] }

        service.registerSubscription(
            RegisterPushSubscriptionRequest(
                endpoint = "https://push.example/abc",
                p256dh = "new-p256dh",
                auth = "new-auth"
            ),
            principal
        )

        assertEquals(callerId, existing.user?.id)
        assertEquals("new-p256dh", existing.p256dh)
    }

    @Test
    fun `deleteSubscription hides a foreign subscription with not found`() {
        val caller = caller()
        val principal = UserPrincipal(subject = "sub-caller", roles = setOf(UserRole.MEMBER))
        val foreign = PushSubscriptionEntity(endpoint = "https://push.example/x", user = other())
        `when`(userService.getOrCreateUser(principal)).thenReturn(caller)
        `when`(pushSubscriptionRepository.findById(foreign.id)).thenReturn(Optional.of(foreign))

        val ex = assertThrows(ResourceNotFoundException::class.java) {
            service.deleteSubscription(foreign.id, principal)
        }
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode)
        verify(pushSubscriptionRepository, never()).delete(foreign)
    }

    @Test
    fun `sendNotification denies a plain member`() {
        val caller = caller()
        val principal = UserPrincipal(subject = "sub-caller", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(caller)

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.sendNotification(
                SendNotificationRequest(userId = otherId.toString(), title = "Hi", body = "Text"),
                principal
            )
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        verify(notificationRepository, never()).save(anyNotification())
    }

    @Test
    fun `sendNotification stores the notification and hands push to the dispatcher`() {
        val admin = caller()
        val target = other()
        val principal = UserPrincipal(subject = "sub-caller", roles = setOf(UserRole.ADMIN))

        `when`(userService.getOrCreateUser(principal)).thenReturn(admin)
        `when`(userRepository.findById(otherId)).thenReturn(Optional.of(target))
        `when`(notificationRepository.save(anyNotification())).thenAnswer { it.arguments[0] }

        val dto = service.sendNotification(
            SendNotificationRequest(userId = otherId.toString(), title = "Hi", body = "Text", type = "invite"),
            principal
        )

        assertEquals("Hi", dto.title)
        assertEquals("invite", dto.type)
        verify(pushDispatcher).dispatch(listOf(otherId), PushMessage(title = "Hi", body = "Text", type = "invite"))
        verify(pushSender, never()).send(anyTarget(), anyMessage())
        verify(auditService).recordNotification(
            eq(admin) ?: admin,
            eq(AuditService.ACTION_NOTIFICATION_SENT) ?: "",
            any(UUID::class.java) ?: UUID.randomUUID(),
            anyString()
        )
    }

    @Test
    fun `notifyUsers stores one notification per recipient and dispatches once`() {
        val first = caller()
        val second = other()
        `when`(notificationRepository.save(anyNotification())).thenAnswer { it.arguments[0] }

        val stored = service.notifyUsers(listOf(first, second), "Neuer Moment", "Sei dabei", "moment")

        assertEquals(2, stored.size)
        verify(pushDispatcher).dispatch(
            listOf(callerId, otherId),
            PushMessage(title = "Neuer Moment", body = "Sei dabei", type = "moment")
        )
    }

    @Test
    fun `unreadCount counts unread notifications`() {
        val caller = caller()
        val principal = UserPrincipal(subject = "sub-caller", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(caller)
        `when`(notificationRepository.findByUserIdAndReadFalse(callerId)).thenReturn(
            listOf(
                NotificationEntity(user = caller, title = "a", body = "b", type = "general"),
                NotificationEntity(user = caller, title = "c", body = "d", type = "general")
            )
        )

        assertEquals(2L, service.unreadCount(principal).unread)
    }

    @Test
    fun `vapidPublicKey delegates to the sender`() {
        `when`(pushSender.isEnabled()).thenReturn(true)
        `when`(pushSender.publicKey()).thenReturn("public-key-value")

        val dto = service.vapidPublicKey()

        assertTrue(dto.enabled)
        assertEquals("public-key-value", dto.publicKey)
    }
}
