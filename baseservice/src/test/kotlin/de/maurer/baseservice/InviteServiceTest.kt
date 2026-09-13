package de.maurer.baseservice

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventGuestEntity
import de.maurer.baseservice.domain.EventInviteEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.GuestStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AcceptInviteRequest
import de.maurer.baseservice.dto.CreateInviteRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.InvitationExpiredException
import de.maurer.baseservice.error.InvitationRevokedException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.EventGuestRepository
import de.maurer.baseservice.repository.EventInviteRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.InviteService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.support.SecureTokens
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.ArgumentCaptor
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
class InviteServiceTest {

    @Mock
    private lateinit var eventRepository: EventRepository

    @Mock
    private lateinit var eventInviteRepository: EventInviteRepository

    @Mock
    private lateinit var eventGuestRepository: EventGuestRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    private lateinit var inviteService: InviteService

    private val ownerId: UUID = UUID.randomUUID()
    private val otherId: UUID = UUID.randomUUID()
    private val eventId: UUID = UUID.randomUUID()
    private val inviteId: UUID = UUID.randomUUID()
    private val startsAt: Instant = Instant.parse("2026-10-01T18:00:00Z")

    @BeforeEach
    fun setup() {
        inviteService = InviteService(
            eventRepository,
            eventInviteRepository,
            eventGuestRepository,
            userRoleRepository,
            userService
        )
        `when`(userRoleRepository.findByIdUserId(any(UUID::class.java) ?: ownerId)).thenReturn(emptyList())
    }

    private fun anyInvite(): EventInviteEntity = any(EventInviteEntity::class.java) ?: EventInviteEntity()

    private fun anyGuest(): EventGuestEntity = any(EventGuestEntity::class.java) ?: EventGuestEntity()

    private fun ownerUser() = UserEntity(id = ownerId, keycloakSubject = "sub-owner", displayName = "Owner")

    private fun otherUser() = UserEntity(id = otherId, keycloakSubject = "sub-other", displayName = "Other")

    private fun existingEvent(owner: UserEntity, status: EventStatus = EventStatus.published) = EventEntity(
        id = eventId,
        title = "Sommerfest",
        startsAt = startsAt,
        status = status,
        owner = owner
    )

    private fun existingInvite(
        event: EventEntity,
        creator: UserEntity,
        expiresAt: Instant? = Instant.now().plusSeconds(3600),
        revoked: Boolean = false,
        maxUses: Int? = null,
        usesCount: Int = 0,
        tokenHash: String = SecureTokens.sha256Hex("valid-token")
    ) = EventInviteEntity(
        id = inviteId,
        event = event,
        tokenHash = tokenHash,
        createdBy = creator,
        role = "guest",
        maxUses = maxUses,
        usesCount = usesCount,
        expiresAt = expiresAt,
        revoked = revoked
    )

    @Test
    fun `createInvite stores only a hash and returns the raw token once`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent(owner)))
        `when`(eventInviteRepository.save(anyInvite())).thenAnswer { it.arguments[0] }

        val response = inviteService.createInvite(eventId, CreateInviteRequest(), principal)

        assertTrue(response.token.isNotBlank())
        assertEquals("guest", response.role)
        assertFalse(response.revoked)
        assertNotNull(response.expiresAt)
        assertTrue(response.acceptPath.contains(response.token))

        val captor = ArgumentCaptor.forClass(EventInviteEntity::class.java)
        verify(eventInviteRepository).save(captor.capture())
        val persisted = captor.value
        assertEquals(64, persisted.tokenHash.length)
        assertEquals(SecureTokens.sha256Hex(response.token), persisted.tokenHash)
        assertNotEquals(response.token, persisted.tokenHash)
    }

    @Test
    fun `createInvite denies an unrelated member`() {
        val owner = ownerUser()
        val other = otherUser()
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent(owner)))

        val ex = assertThrows(AccessDeniedException::class.java) {
            inviteService.createInvite(eventId, CreateInviteRequest(), principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        verify(eventInviteRepository, never()).save(anyInvite())
    }

    @Test
    fun `createInvite lets a board member invite for a foreign event`() {
        val owner = ownerUser()
        val boardUser = UserEntity(id = otherId, keycloakSubject = "sub-board", displayName = "Board")
        val principal = UserPrincipal(subject = "sub-board", roles = setOf(UserRole.BOARD))

        `when`(userService.getOrCreateUser(principal)).thenReturn(boardUser)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent(owner)))
        `when`(eventInviteRepository.save(anyInvite())).thenAnswer { it.arguments[0] }

        val response = inviteService.createInvite(eventId, CreateInviteRequest(maxUses = 5), principal)

        assertEquals(5, response.maxUses)
    }

    @Test
    fun `createInvite rejects a cancelled event`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId))
            .thenReturn(Optional.of(existingEvent(owner, EventStatus.cancelled)))

        val ex = assertThrows(EventNotActiveException::class.java) {
            inviteService.createInvite(eventId, CreateInviteRequest(), principal)
        }
        assertEquals(ErrorCode.EVENT_NOT_ACTIVE, ex.errorCode)
    }

    @Test
    fun `listInvites returns invites without the raw token and denies non-owner`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent(owner)))
        `when`(eventInviteRepository.findByEventId(eventId))
            .thenReturn(listOf(existingInvite(existingEvent(owner), owner)))

        val invites = inviteService.listInvites(eventId, principal)
        assertEquals(1, invites.size)
        assertEquals(inviteId.toString(), invites[0].id)
        assertTrue(invites[0].active)

        val other = otherUser()
        val otherPrincipal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(otherPrincipal)).thenReturn(other)

        val ex = assertThrows(AccessDeniedException::class.java) {
            inviteService.listInvites(eventId, otherPrincipal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `revokeInvite marks the invite as revoked`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val invite = existingInvite(event, owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventInviteRepository.findById(inviteId)).thenReturn(Optional.of(invite))
        `when`(eventInviteRepository.save(anyInvite())).thenAnswer { it.arguments[0] }

        inviteService.revokeInvite(eventId, inviteId, principal)

        assertTrue(invite.revoked)
        verify(eventInviteRepository).save(invite)
    }

    @Test
    fun `revokeInvite fails for an unknown invite`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent(owner)))
        `when`(eventInviteRepository.findById(inviteId)).thenReturn(Optional.empty())

        val ex = assertThrows(ResourceNotFoundException::class.java) {
            inviteService.revokeInvite(eventId, inviteId, principal)
        }
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode)
    }

    @Test
    fun `acceptInvite creates an active guest with a hashed guest token and increments the usage`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val invite = existingInvite(event, owner, maxUses = 3, usesCount = 1)

        `when`(eventInviteRepository.findByTokenHash(SecureTokens.sha256Hex("valid-token")))
            .thenReturn(Optional.of(invite))
        `when`(eventGuestRepository.save(anyGuest())).thenAnswer { it.arguments[0] }
        `when`(eventInviteRepository.save(anyInvite())).thenAnswer { it.arguments[0] }

        val response = inviteService.acceptInvite(
            AcceptInviteRequest(token = "valid-token", displayName = "  Besucher  ")
        )

        assertTrue(response.guestToken.isNotBlank())
        assertEquals(eventId.toString(), response.eventId)
        assertEquals("Sommerfest", response.eventTitle)
        assertEquals("Besucher", response.displayName)
        assertEquals(GuestStatus.active.name, response.status)
        assertEquals(2, invite.usesCount)

        val captor = ArgumentCaptor.forClass(EventGuestEntity::class.java)
        verify(eventGuestRepository).save(captor.capture())
        val guest = captor.value
        assertEquals(SecureTokens.sha256Hex(response.guestToken), guest.guestTokenHash)
        assertNotEquals(response.guestToken, guest.guestTokenHash)
        assertEquals(GuestStatus.active, guest.status)
        assertEquals(event.id, guest.event?.id)
    }

    @Test
    fun `acceptInvite uses a default display name when none is provided`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val invite = existingInvite(event, owner)

        `when`(eventInviteRepository.findByTokenHash(SecureTokens.sha256Hex("valid-token")))
            .thenReturn(Optional.of(invite))
        `when`(eventGuestRepository.save(anyGuest())).thenAnswer { it.arguments[0] }
        `when`(eventInviteRepository.save(anyInvite())).thenAnswer { it.arguments[0] }

        val response = inviteService.acceptInvite(AcceptInviteRequest(token = "valid-token"))

        assertEquals(InviteService.DEFAULT_GUEST_DISPLAY_NAME, response.displayName)
    }

    @Test
    fun `acceptInvite rejects a blank token`() {
        val ex = assertThrows(InvalidRequestException::class.java) {
            inviteService.acceptInvite(AcceptInviteRequest(token = "   "))
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `acceptInvite rejects an unknown token`() {
        `when`(eventInviteRepository.findByTokenHash(SecureTokens.sha256Hex("ghost")))
            .thenReturn(Optional.empty())

        val ex = assertThrows(ResourceNotFoundException::class.java) {
            inviteService.acceptInvite(AcceptInviteRequest(token = "ghost"))
        }
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode)
    }

    @Test
    fun `acceptInvite rejects a revoked invite with 410 semantics`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val invite = existingInvite(event, owner, revoked = true)

        `when`(eventInviteRepository.findByTokenHash(SecureTokens.sha256Hex("valid-token")))
            .thenReturn(Optional.of(invite))

        val ex = assertThrows(InvitationRevokedException::class.java) {
            inviteService.acceptInvite(AcceptInviteRequest(token = "valid-token"))
        }
        assertEquals(ErrorCode.INVITATION_REVOKED, ex.errorCode)
        verify(eventGuestRepository, never()).save(anyGuest())
    }

    @Test
    fun `acceptInvite rejects an expired invite with 410 semantics`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val invite = existingInvite(event, owner, expiresAt = Instant.now().minusSeconds(60))

        `when`(eventInviteRepository.findByTokenHash(SecureTokens.sha256Hex("valid-token")))
            .thenReturn(Optional.of(invite))

        val ex = assertThrows(InvitationExpiredException::class.java) {
            inviteService.acceptInvite(AcceptInviteRequest(token = "valid-token"))
        }
        assertEquals(ErrorCode.INVITATION_EXPIRED, ex.errorCode)
        verify(eventGuestRepository, never()).save(anyGuest())
    }

    @Test
    fun `acceptInvite rejects an invite that reached its usage limit`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val invite = existingInvite(event, owner, maxUses = 2, usesCount = 2)

        `when`(eventInviteRepository.findByTokenHash(SecureTokens.sha256Hex("valid-token")))
            .thenReturn(Optional.of(invite))

        val ex = assertThrows(InvitationExpiredException::class.java) {
            inviteService.acceptInvite(AcceptInviteRequest(token = "valid-token"))
        }
        assertEquals(ErrorCode.INVITATION_EXPIRED, ex.errorCode)
        verify(eventGuestRepository, never()).save(anyGuest())
    }

    @Test
    fun `acceptInvite rejects a cancelled event`() {
        val owner = ownerUser()
        val event = existingEvent(owner, EventStatus.cancelled)
        val invite = existingInvite(event, owner)

        `when`(eventInviteRepository.findByTokenHash(SecureTokens.sha256Hex("valid-token")))
            .thenReturn(Optional.of(invite))

        val ex = assertThrows(EventNotActiveException::class.java) {
            inviteService.acceptInvite(AcceptInviteRequest(token = "valid-token"))
        }
        assertEquals(ErrorCode.EVENT_NOT_ACTIVE, ex.errorCode)
        verify(eventGuestRepository, never()).save(anyGuest())
    }
}
