package de.maurer.baseservice

import de.maurer.baseservice.domain.DrinkWithMeSessionEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.StartDrinkWithMeRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ConsentRequiredException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkWithMeSessionRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.DrinkWithMeService
import de.maurer.baseservice.service.UserService
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
class DrinkWithMeServiceTest {

    @Mock
    private lateinit var eventRepository: EventRepository

    @Mock
    private lateinit var eventParticipantRepository: EventParticipantRepository

    @Mock
    private lateinit var drinkWithMeSessionRepository: DrinkWithMeSessionRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    private lateinit var service: DrinkWithMeService

    private val ownerId: UUID = UUID.randomUUID()
    private val otherId: UUID = UUID.randomUUID()
    private val eventId: UUID = UUID.randomUUID()
    private val sessionId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        service = DrinkWithMeService(
            eventRepository,
            eventParticipantRepository,
            drinkWithMeSessionRepository,
            userRoleRepository,
            userService
        )
        `when`(userRoleRepository.findByIdUserId(any(UUID::class.java) ?: ownerId)).thenReturn(emptyList())
        `when`(drinkWithMeSessionRepository.findByEventIdAndUserIdAndActiveTrue(any(UUID::class.java) ?: eventId, any(UUID::class.java) ?: ownerId))
            .thenReturn(emptyList())
        `when`(drinkWithMeSessionRepository.save(anySession())).thenAnswer { it.arguments[0] }
    }

    private fun anySession(): DrinkWithMeSessionEntity =
        any(DrinkWithMeSessionEntity::class.java) ?: DrinkWithMeSessionEntity()

    private fun ownerUser() = UserEntity(id = ownerId, keycloakSubject = "sub-owner", displayName = "Owner")

    private fun otherUser() = UserEntity(id = otherId, keycloakSubject = "sub-other", displayName = "Other")

    private fun event(status: EventStatus = EventStatus.active, owner: UserEntity = ownerUser()) = EventEntity(
        id = eventId,
        title = "Sommerfest",
        startsAt = Instant.parse("2026-10-01T18:00:00Z"),
        status = status,
        owner = owner
    )

    private fun session(
        user: UserEntity,
        event: EventEntity,
        active: Boolean = true,
        expiresAt: Instant = Instant.now().plusSeconds(3600),
        id: UUID = sessionId
    ) = DrinkWithMeSessionEntity(
        id = id,
        user = user,
        event = event,
        latitude = 50.0,
        longitude = 8.0,
        message = "Trink mit mir",
        active = active,
        expiresAt = expiresAt
    )

    @Test
    fun `startSession stores a session for the owner with consent`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))

        val dto = service.startSession(
            eventId,
            StartDrinkWithMeRequest(consent = true, latitude = 50.0, longitude = 8.0, message = "Prost", durationMinutes = 60),
            principal
        )

        assertTrue(dto.active)
        assertEquals(ownerId.toString(), dto.userId)
        assertEquals(50.0, dto.latitude)
        assertEquals("Prost", dto.message)
        assertTrue(dto.expiresAt.isAfter(Instant.now()))
        verify(drinkWithMeSessionRepository).save(anySession())
    }

    @Test
    fun `startSession without consent is rejected`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))

        val ex = assertThrows(ConsentRequiredException::class.java) {
            service.startSession(eventId, StartDrinkWithMeRequest(consent = false, durationMinutes = 60), principal)
        }
        assertEquals(ErrorCode.CONSENT_REQUIRED, ex.errorCode)
        verify(drinkWithMeSessionRepository, never()).save(anySession())
    }

    @Test
    fun `startSession requires a duration`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.startSession(eventId, StartDrinkWithMeRequest(consent = true, durationMinutes = null), principal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `startSession rejects partial coordinates`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.startSession(
                eventId,
                StartDrinkWithMeRequest(consent = true, latitude = 50.0, longitude = null, durationMinutes = 30),
                principal
            )
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `startSession denies an unrelated member`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val other = otherUser()
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId)).thenReturn(Optional.empty())

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.startSession(eventId, StartDrinkWithMeRequest(consent = true, durationMinutes = 30), principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `startSession rejects a cancelled event`() {
        val owner = ownerUser()
        val event = event(status = EventStatus.cancelled, owner = owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))

        val ex = assertThrows(EventNotActiveException::class.java) {
            service.startSession(eventId, StartDrinkWithMeRequest(consent = true, durationMinutes = 30), principal)
        }
        assertEquals(ErrorCode.EVENT_NOT_ACTIVE, ex.errorCode)
    }

    @Test
    fun `startSession deactivates an existing active session of the same member`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        val existing = session(owner, event)

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(drinkWithMeSessionRepository.findByEventIdAndUserIdAndActiveTrue(eventId, ownerId))
            .thenReturn(listOf(existing))

        service.startSession(eventId, StartDrinkWithMeRequest(consent = true, durationMinutes = 30), principal)

        assertFalse(existing.active)
        verify(drinkWithMeSessionRepository).save(anySession())
    }

    @Test
    fun `listActiveSessions allows a participant and hides expired sessions`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val other = otherUser()
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        val active = session(owner, event, active = true, expiresAt = Instant.now().plusSeconds(600), id = UUID.randomUUID())
        val expired = session(other, event, active = true, expiresAt = Instant.now().minusSeconds(60), id = UUID.randomUUID())

        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId))
            .thenReturn(Optional.of(EventParticipantEntity(event = event, user = other)))
        `when`(drinkWithMeSessionRepository.findByEventIdAndActiveTrue(eventId)).thenReturn(listOf(active, expired))

        val sessions = service.listActiveSessions(eventId, principal)

        assertEquals(1, sessions.size)
        assertEquals(active.id.toString(), sessions[0].id)
        assertFalse(expired.active)
    }

    @Test
    fun `listActiveSessions denies an unrelated member`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val other = otherUser()
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId)).thenReturn(Optional.empty())

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.listActiveSessions(eventId, principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `revokeSession allows the owner to revoke the own session`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        val existing = session(owner, event)

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(drinkWithMeSessionRepository.findById(sessionId)).thenReturn(Optional.of(existing))

        val dto = service.revokeSession(eventId, sessionId, principal)

        assertFalse(dto.active)
        assertFalse(existing.active)
    }

    @Test
    fun `revokeSession denies revoking a foreign session for a plain member`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val other = otherUser()
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        val foreignSession = session(owner, event)

        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId))
            .thenReturn(Optional.of(EventParticipantEntity(event = event, user = other)))
        `when`(drinkWithMeSessionRepository.findById(sessionId)).thenReturn(Optional.of(foreignSession))

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.revokeSession(eventId, sessionId, principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        assertTrue(foreignSession.active)
    }

    @Test
    fun `revokeSession allows board to revoke a foreign session`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val board = UserEntity(id = otherId, keycloakSubject = "sub-board", displayName = "Board")
        val principal = UserPrincipal(subject = "sub-board", roles = setOf(UserRole.BOARD))
        val foreignSession = session(owner, event)

        `when`(userService.getOrCreateUser(principal)).thenReturn(board)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(drinkWithMeSessionRepository.findById(sessionId)).thenReturn(Optional.of(foreignSession))

        val dto = service.revokeSession(eventId, sessionId, principal)

        assertFalse(dto.active)
    }

    @Test
    fun `revokeSession rejects a session of another event`() {
        val owner = ownerUser()
        val event = event(owner = owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        val foreignEvent = EventEntity(id = UUID.randomUUID(), title = "Fremd", startsAt = Instant.now(), status = EventStatus.active, owner = owner)
        val foreignSession = session(owner, foreignEvent)

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(drinkWithMeSessionRepository.findById(sessionId)).thenReturn(Optional.of(foreignSession))

        val ex = assertThrows(ResourceNotFoundException::class.java) {
            service.revokeSession(eventId, sessionId, principal)
        }
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode)
    }
}
