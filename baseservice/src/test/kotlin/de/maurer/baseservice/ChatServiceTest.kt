package de.maurer.baseservice

import de.maurer.baseservice.domain.ChatMessageEntity
import de.maurer.baseservice.domain.ConversationEntity
import de.maurer.baseservice.domain.ConversationMemberEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventGuestEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.GuestStatus
import de.maurer.baseservice.domain.MomentSessionEntity
import de.maurer.baseservice.domain.MomentVisibility
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.InvitationExpiredException
import de.maurer.baseservice.error.InvitationRevokedException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.ChatMessageRepository
import de.maurer.baseservice.repository.ConversationMemberRepository
import de.maurer.baseservice.repository.ConversationRepository
import de.maurer.baseservice.repository.EventGuestRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.MomentSessionRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.ChatService
import de.maurer.baseservice.service.MomentAccessPolicy
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.support.SecureTokens
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
import java.time.Instant
import java.util.*

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ChatServiceTest {

    @Mock
    private lateinit var eventRepository: EventRepository

    @Mock
    private lateinit var eventParticipantRepository: EventParticipantRepository

    @Mock
    private lateinit var conversationRepository: ConversationRepository

    @Mock
    private lateinit var conversationMemberRepository: ConversationMemberRepository

    @Mock
    private lateinit var chatMessageRepository: ChatMessageRepository

    @Mock
    private lateinit var eventGuestRepository: EventGuestRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    @Mock
    private lateinit var momentSessionRepository: MomentSessionRepository

    private lateinit var chatService: ChatService

    private val ownerId: UUID = UUID.randomUUID()
    private val otherId: UUID = UUID.randomUUID()
    private val eventId: UUID = UUID.randomUUID()
    private val conversationId: UUID = UUID.randomUUID()
    private val guestId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        chatService = ChatService(
            eventRepository,
            eventParticipantRepository,
            conversationRepository,
            conversationMemberRepository,
            chatMessageRepository,
            eventGuestRepository,
            StammtischTestSupport.access(userRoleRepository),
            userService,
            momentSessionRepository,
            MomentAccessPolicy(eventParticipantRepository, StammtischTestSupport.access(userRoleRepository)),
            mock(de.maurer.baseservice.service.StatisticsRecorder::class.java)
        )
        `when`(userRoleRepository.findByIdUserId(any(UUID::class.java) ?: ownerId)).thenReturn(emptyList())
        `when`(conversationMemberRepository.countByConversationId(any(UUID::class.java) ?: conversationId)).thenReturn(0L)
        `when`(conversationMemberRepository.findByConversationIdAndUserId(any(UUID::class.java) ?: conversationId, any(UUID::class.java) ?: ownerId))
            .thenReturn(Optional.empty())
        `when`(conversationMemberRepository.findByConversationIdAndGuestId(any(UUID::class.java) ?: conversationId, any(UUID::class.java) ?: guestId))
            .thenReturn(Optional.empty())
        `when`(conversationMemberRepository.save(anyMember())).thenAnswer { it.arguments[0] }
    }

    private fun anyMember(): ConversationMemberEntity =
        any(ConversationMemberEntity::class.java) ?: ConversationMemberEntity()

    private fun anyMessage(): ChatMessageEntity = any(ChatMessageEntity::class.java) ?: ChatMessageEntity()

    private fun ownerUser() = UserEntity(id = ownerId, keycloakSubject = "sub-owner", displayName = "Owner")

    private fun otherUser() = UserEntity(id = otherId, keycloakSubject = "sub-other", displayName = "Other")

    private fun event(status: EventStatus = EventStatus.active, owner: UserEntity = ownerUser()) = EventEntity(
        id = eventId,
        title = "Sommerfest",
        startsAt = Instant.parse("2026-10-01T18:00:00Z"),
        status = status,
        owner = owner
    )

    private fun conversation(event: EventEntity) = ConversationEntity(
        id = conversationId,
        type = ChatService.CONVERSATION_TYPE_EVENT,
        event = event,
        title = event.title
    )

    private fun guest(event: EventEntity, tokenHash: String, status: GuestStatus = GuestStatus.active, expiresAt: Instant = Instant.now().plusSeconds(3600)) =
        EventGuestEntity(
            id = guestId,
            event = event,
            guestTokenHash = tokenHash,
            displayName = "Gast",
            status = status,
            expiresAt = expiresAt
        )

    @Test
    fun `sendMessage stores a member message for the owner`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(conversationRepository.findByDirectKey(ChatService.eventConversationKey(eventId))).thenReturn(Optional.of(conversation(event)))
        `when`(chatMessageRepository.save(anyMessage())).thenAnswer { it.arguments[0] }

        val dto = chatService.sendMessage(eventId, SendMessageRequest(message = "Hallo"), principal)

        assertEquals("Hallo", dto.message)
        assertEquals(ChatService.SENDER_TYPE_MEMBER, dto.senderType)
        assertEquals(ownerId.toString(), dto.senderId)
        verify(chatMessageRepository).save(anyMessage())
    }

    @Test
    fun `listMessages denies an unrelated member`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val other = otherUser()
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId)).thenReturn(Optional.empty())

        val ex = assertThrows(AccessDeniedException::class.java) {
            chatService.listMessages(eventId, principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `listMessages allows a participant`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val other = otherUser()
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId))
            .thenReturn(Optional.of(EventParticipantEntity(event = event, user = other)))
        `when`(conversationRepository.findByDirectKey(ChatService.eventConversationKey(eventId))).thenReturn(Optional.of(conversation(event)))
        `when`(chatMessageRepository.findByConversationIdOrderByCreatedAtAsc(conversationId)).thenReturn(emptyList())

        val messages = chatService.listMessages(eventId, principal)

        assertTrue(messages.isEmpty())
    }

    @Test
    fun `sendMessage allows a board member on a foreign event`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val board = UserEntity(id = otherId, keycloakSubject = "sub-board", displayName = "Board")
        val principal = UserPrincipal(subject = "sub-board", roles = setOf(UserRole.BOARD))

        `when`(userService.getOrCreateUser(principal)).thenReturn(board)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(conversationRepository.findByDirectKey(ChatService.eventConversationKey(eventId))).thenReturn(Optional.of(conversation(event)))
        `when`(chatMessageRepository.save(anyMessage())).thenAnswer { it.arguments[0] }

        val dto = chatService.sendMessage(eventId, SendMessageRequest(message = "Moderation"), principal)

        assertEquals("Moderation", dto.message)
    }

    @Test
    fun `sendMessage rejects a cancelled event`() {
        val owner = ownerUser()
        val event = event(status = EventStatus.cancelled, owner = owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))

        val ex = assertThrows(EventNotActiveException::class.java) {
            chatService.sendMessage(eventId, SendMessageRequest(message = "Hallo"), principal)
        }
        assertEquals(ErrorCode.EVENT_NOT_ACTIVE, ex.errorCode)
        verify(chatMessageRepository, never()).save(anyMessage())
    }

    @Test
    fun `sendGuestMessage stores a guest message for a valid token`() {
        val event = event()
        val rawToken = "guest-token-value"
        val guest = guest(event, SecureTokens.sha256Hex(rawToken))

        `when`(eventGuestRepository.findByGuestTokenHash(SecureTokens.sha256Hex(rawToken))).thenReturn(Optional.of(guest))
        `when`(conversationRepository.findByDirectKey(ChatService.eventConversationKey(eventId))).thenReturn(Optional.of(conversation(event)))
        `when`(chatMessageRepository.save(anyMessage())).thenAnswer { it.arguments[0] }

        val dto = chatService.sendGuestMessage(eventId, rawToken, SendMessageRequest(message = "Hallo vom Gast"))

        assertEquals("Hallo vom Gast", dto.message)
        assertEquals(ChatService.SENDER_TYPE_GUEST, dto.senderType)
        assertEquals(guestId.toString(), dto.senderId)
        assertEquals("Gast", dto.senderName)
    }

    @Test
    fun `guest token for a different event is rejected`() {
        val event = event()
        val rawToken = "guest-token-value"
        val foreignEvent = EventEntity(id = UUID.randomUUID(), title = "Fremd", startsAt = Instant.now(), status = EventStatus.active)
        val guest = guest(foreignEvent, SecureTokens.sha256Hex(rawToken))

        `when`(eventGuestRepository.findByGuestTokenHash(SecureTokens.sha256Hex(rawToken))).thenReturn(Optional.of(guest))

        val ex = assertThrows(AccessDeniedException::class.java) {
            chatService.listGuestMessages(eventId, rawToken)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `revoked guest token is rejected`() {
        val event = event()
        val rawToken = "guest-token-value"
        val guest = guest(event, SecureTokens.sha256Hex(rawToken), status = GuestStatus.revoked)

        `when`(eventGuestRepository.findByGuestTokenHash(SecureTokens.sha256Hex(rawToken))).thenReturn(Optional.of(guest))

        val ex = assertThrows(InvitationRevokedException::class.java) {
            chatService.listGuestMessages(eventId, rawToken)
        }
        assertEquals(ErrorCode.INVITATION_REVOKED, ex.errorCode)
    }

    @Test
    fun `expired guest token is rejected`() {
        val event = event()
        val rawToken = "guest-token-value"
        val guest = guest(event, SecureTokens.sha256Hex(rawToken), expiresAt = Instant.now().minusSeconds(60))

        `when`(eventGuestRepository.findByGuestTokenHash(SecureTokens.sha256Hex(rawToken))).thenReturn(Optional.of(guest))

        val ex = assertThrows(InvitationExpiredException::class.java) {
            chatService.listGuestMessages(eventId, rawToken)
        }
        assertEquals(ErrorCode.INVITATION_EXPIRED, ex.errorCode)
    }

    @Test
    fun `missing guest token is denied`() {
        val ex = assertThrows(AccessDeniedException::class.java) {
            chatService.listGuestMessages(eventId, "  ")
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `unknown guest token is denied`() {
        `when`(eventGuestRepository.findByGuestTokenHash(any(String::class.java) ?: "")).thenReturn(Optional.empty())

        val ex = assertThrows(AccessDeniedException::class.java) {
            chatService.listGuestMessages(eventId, "unknown-token")
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `createMomentConversation creates conversation with 24h expiration`() {
        val ev = event()
        `when`(conversationRepository.save(any(ConversationEntity::class.java) ?: ConversationEntity())).thenAnswer { it.arguments[0] }

        val before = Instant.now().plusSeconds(86390)
        val conversation = chatService.createMomentConversation(ev, "Gemeinsames Beten")
        val after = Instant.now().plusSeconds(86410)

        assertEquals("moment", conversation.type)
        assertEquals("Moment: Gemeinsames Beten", conversation.title)
        assertEquals(ev, conversation.event)
        assertNotNull(conversation.expiresAt)
        assertTrue(conversation.expiresAt!!.isAfter(before), "expiresAt should be after $before")
        assertTrue(conversation.expiresAt!!.isBefore(after), "expiresAt should be before $after")
    }

    @Test
    fun `getConversationById returns conversation details when active`() {
        val ev = event()
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        val conversation = ConversationEntity(
            id = conversationId,
            type = "moment",
            event = ev,
            title = "Moment: Anstoßen",
            expiresAt = Instant.now().plusSeconds(3600)
        )

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(conversationRepository.findById(conversationId)).thenReturn(Optional.of(conversation))
        `when`(momentSessionRepository.findByConversationId(conversationId))
            .thenReturn(Optional.of(MomentSessionEntity(event = ev, creator = owner, conversation = conversation, visibility = MomentVisibility.event)))

        val dto = chatService.getConversationById(conversationId, principal)

        assertEquals(conversationId.toString(), dto.id)
        assertEquals("moment", dto.type)
        assertEquals("Moment: Anstoßen", dto.title)
        assertEquals(conversation.expiresAt, dto.expiresAt)
    }

    @Test
    fun `getConversationById rejects expired moment conversation with INVALID_REQUEST`() {
        val ev = event()
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        val conversation = ConversationEntity(
            id = conversationId,
            type = "moment",
            event = ev,
            title = "Moment: Anstoßen",
            expiresAt = Instant.now().minusSeconds(10)
        )

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(conversationRepository.findById(conversationId)).thenReturn(Optional.of(conversation))

        val ex = assertThrows(InvalidRequestException::class.java) {
            chatService.getConversationById(conversationId, principal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
        assertTrue(ex.message.contains("abgelaufen"))
    }

    @Test
    fun `listConversationMessages rejects expired moment conversation with INVALID_REQUEST`() {
        val ev = event()
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        val conversation = ConversationEntity(
            id = conversationId,
            type = "moment",
            event = ev,
            title = "Moment: Anstoßen",
            expiresAt = Instant.now().minusSeconds(10)
        )

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(conversationRepository.findById(conversationId)).thenReturn(Optional.of(conversation))

        val ex = assertThrows(InvalidRequestException::class.java) {
            chatService.listConversationMessages(conversationId, principal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `sendConversationMessage rejects expired moment conversation with INVALID_REQUEST`() {
        val ev = event()
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        val conversation = ConversationEntity(
            id = conversationId,
            type = "moment",
            event = ev,
            title = "Moment: Anstoßen",
            expiresAt = Instant.now().minusSeconds(10)
        )

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(conversationRepository.findById(conversationId)).thenReturn(Optional.of(conversation))

        val ex = assertThrows(InvalidRequestException::class.java) {
            chatService.sendConversationMessage(conversationId, SendMessageRequest(message = "Zu spät"), principal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }
}
