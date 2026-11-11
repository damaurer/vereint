package de.maurer.baseservice

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AddParticipantRequest
import de.maurer.baseservice.dto.CreateEventRequest
import de.maurer.baseservice.dto.UpdateEventRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.EventInvitationService
import de.maurer.baseservice.service.EventService
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
import java.time.Instant
import java.util.*

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EventServiceTest {

    @Mock
    private lateinit var eventRepository: EventRepository

    @Mock
    private lateinit var eventParticipantRepository: EventParticipantRepository

    @Mock
    private lateinit var userRepository: UserRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    @Mock
    private lateinit var eventInvitationService: EventInvitationService

    private lateinit var eventService: EventService

    private val ownerId: UUID = UUID.randomUUID()
    private val otherId: UUID = UUID.randomUUID()
    private val eventId: UUID = UUID.randomUUID()

    private val startsAt: Instant = Instant.parse("2026-10-01T18:00:00Z")

    @BeforeEach
    fun setup() {
        eventService = EventService(
            eventRepository,
            eventParticipantRepository,
            StammtischTestSupport.members(userRepository),
            StammtischTestSupport.access(userRoleRepository),
            userService,
            eventInvitationService,
            mock(de.maurer.baseservice.service.StatisticsRecorder::class.java)
        )
        `when`(eventParticipantRepository.countByEventId(any(UUID::class.java) ?: eventId)).thenReturn(0L)
        `when`(userRoleRepository.findByIdUserId(any(UUID::class.java) ?: ownerId)).thenReturn(emptyList())
    }

    private fun anyEventEntity(): EventEntity = any(EventEntity::class.java) ?: EventEntity()

    private fun anyParticipant(): EventParticipantEntity =
        any(EventParticipantEntity::class.java) ?: EventParticipantEntity()

    private fun ownerUser() = UserEntity(id = ownerId, keycloakSubject = "sub-owner", displayName = "Owner")

    private fun otherUser() = UserEntity(id = otherId, keycloakSubject = "sub-other", displayName = "Other")

    private fun existingEvent(owner: UserEntity) = EventEntity(
        id = eventId,
        title = "Sommerfest",
        startsAt = startsAt,
        status = EventStatus.draft,
        owner = owner
    )

    @Test
    fun `createEvent stores event with caller as owner and draft status`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.save(anyEventEntity())).thenAnswer { it.arguments[0] }

        val dto = eventService.createEvent(
            CreateEventRequest(title = "Sommerfest", startsAt = startsAt),
            principal
        )

        assertEquals("Sommerfest", dto.title)
        assertEquals(EventStatus.draft.name, dto.status)
        assertEquals(ownerId.toString(), dto.ownerId)
        verify(eventRepository).save(anyEventEntity())
    }

    @Test
    fun `createEvent denies callers without a member role`() {
        val guest = UserEntity(id = otherId, keycloakSubject = "sub-guest", displayName = "Guest")
        val principal = UserPrincipal(subject = "sub-guest", roles = emptySet())

        `when`(userService.getOrCreateUser(principal)).thenReturn(guest)

        val ex = assertThrows(AccessDeniedException::class.java) {
            eventService.createEvent(CreateEventRequest(title = "X", startsAt = startsAt), principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        verify(eventRepository, never()).save(anyEventEntity())
    }

    @Test
    fun `createEvent rejects endsAt before startsAt`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)

        val ex = assertThrows(InvalidRequestException::class.java) {
            eventService.createEvent(
                CreateEventRequest(
                    title = "Sommerfest",
                    startsAt = startsAt,
                    endsAt = startsAt.minusSeconds(3600)
                ),
                principal
            )
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `getEvent allows the owner but denies an unrelated member`() {
        val owner = ownerUser()
        val event = existingEvent(owner)

        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))

        val ownerPrincipal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(ownerPrincipal)).thenReturn(owner)
        val dto = eventService.getEvent(eventId, ownerPrincipal)
        assertEquals(eventId.toString(), dto.id)

        val other = otherUser()
        val otherPrincipal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(otherPrincipal)).thenReturn(other)
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId)).thenReturn(Optional.empty())

        val ex = assertThrows(AccessDeniedException::class.java) {
            eventService.getEvent(eventId, otherPrincipal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `updateEvent denies a non-owner member`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val other = otherUser()
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))

        val ex = assertThrows(AccessDeniedException::class.java) {
            eventService.updateEvent(eventId, UpdateEventRequest(title = "Hijack"), principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        verify(eventRepository, never()).save(anyEventEntity())
    }

    @Test
    fun `updateEvent lets the owner change title and status`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventRepository.save(anyEventEntity())).thenAnswer { it.arguments[0] }

        val dto = eventService.updateEvent(
            eventId,
            UpdateEventRequest(title = "Herbstfest", status = EventStatus.published.name),
            principal
        )

        assertEquals("Herbstfest", dto.title)
        assertEquals(EventStatus.published.name, dto.status)
    }

    @Test
    fun `updateEvent allows a board member to moderate a foreign event`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val boardUser = UserEntity(id = otherId, keycloakSubject = "sub-board", displayName = "Board")
        val principal = UserPrincipal(subject = "sub-board", roles = setOf(UserRole.BOARD))

        `when`(userService.getOrCreateUser(principal)).thenReturn(boardUser)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventRepository.save(anyEventEntity())).thenAnswer { it.arguments[0] }

        val dto = eventService.updateEvent(eventId, UpdateEventRequest(status = EventStatus.cancelled.name), principal)

        assertEquals(EventStatus.cancelled.name, dto.status)
    }

    @Test
    fun `addParticipant lets the owner add a new participant`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val target = otherUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(userRepository.findById(otherId)).thenReturn(Optional.of(target))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId)).thenReturn(Optional.empty())
        `when`(eventParticipantRepository.save(anyParticipant())).thenAnswer { it.arguments[0] }

        val dto = eventService.addParticipant(
            eventId,
            AddParticipantRequest(userId = otherId.toString()),
            principal
        )

        assertEquals(otherId.toString(), dto.userId)
        assertEquals(EventService.PARTICIPANT_ROLE_DEFAULT, dto.role)
        verify(eventParticipantRepository).save(anyParticipant())
    }

    @Test
    fun `addParticipant denies a non-owner member`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val other = otherUser()
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))

        assertThrows(AccessDeniedException::class.java) {
            eventService.addParticipant(eventId, AddParticipantRequest(userId = ownerId.toString()), principal)
        }
        verify(eventParticipantRepository, never()).save(anyParticipant())
    }

    @Test
    fun `addParticipant rejects a duplicate participant`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val target = otherUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(userRepository.findById(otherId)).thenReturn(Optional.of(target))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId))
            .thenReturn(Optional.of(EventParticipantEntity(event = event, user = target)))

        val ex = assertThrows(InvalidRequestException::class.java) {
            eventService.addParticipant(eventId, AddParticipantRequest(userId = otherId.toString()), principal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
        verify(eventParticipantRepository, never()).save(anyParticipant())
    }

    @Test
    fun `removeParticipant deletes an existing participant`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val target = otherUser()
        val participant = EventParticipantEntity(event = event, user = target)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId)).thenReturn(Optional.of(participant))

        eventService.removeParticipant(eventId, otherId, principal)

        verify(eventParticipantRepository).delete(participant)
    }

    @Test
    fun `removeParticipant reports a missing participant with 404`() {
        val owner = ownerUser()
        val event = existingEvent(owner)
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId)).thenReturn(Optional.empty())

        val ex = assertThrows(ResourceNotFoundException::class.java) {
            eventService.removeParticipant(eventId, otherId, principal)
        }
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode)
    }

    @Test
    fun `getEvent reports a missing event with 404`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.empty())

        val ex = assertThrows(ResourceNotFoundException::class.java) {
            eventService.getEvent(eventId, principal)
        }
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode)
    }
}
