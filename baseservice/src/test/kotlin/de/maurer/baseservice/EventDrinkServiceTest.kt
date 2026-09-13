package de.maurer.baseservice

import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.DrinkSublistEntity
import de.maurer.baseservice.domain.DrinkSublistItemEntity
import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AddEventDrinkRequest
import de.maurer.baseservice.dto.AssignSublistRequest
import de.maurer.baseservice.dto.UpdateEventDrinkRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.DrinkSublistItemRepository
import de.maurer.baseservice.repository.DrinkSublistRepository
import de.maurer.baseservice.repository.EventDrinkRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.EventDrinkService
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
import java.math.BigDecimal
import java.time.Instant
import java.util.*

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EventDrinkServiceTest {

    @Mock
    private lateinit var eventDrinkRepository: EventDrinkRepository

    @Mock
    private lateinit var eventRepository: EventRepository

    @Mock
    private lateinit var eventParticipantRepository: EventParticipantRepository

    @Mock
    private lateinit var drinkCatalogRepository: DrinkCatalogRepository

    @Mock
    private lateinit var drinkSublistRepository: DrinkSublistRepository

    @Mock
    private lateinit var drinkSublistItemRepository: DrinkSublistItemRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    private lateinit var service: EventDrinkService

    private val ownerId: UUID = UUID.randomUUID()
    private val otherId: UUID = UUID.randomUUID()
    private val eventId: UUID = UUID.randomUUID()
    private val drinkId: UUID = UUID.randomUUID()
    private val sublistId: UUID = UUID.randomUUID()
    private val eventDrinkId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        service = EventDrinkService(
            eventDrinkRepository,
            eventRepository,
            eventParticipantRepository,
            drinkCatalogRepository,
            drinkSublistRepository,
            drinkSublistItemRepository,
            userRoleRepository,
            userService
        )
        `when`(userRoleRepository.findByIdUserId(any(UUID::class.java) ?: ownerId)).thenReturn(emptyList())
        `when`(eventDrinkRepository.findByEventId(any(UUID::class.java) ?: eventId)).thenReturn(emptyList())
    }

    private fun anyEventDrink(): EventDrinkEntity = any(EventDrinkEntity::class.java) ?: EventDrinkEntity()

    private fun ownerUser() = UserEntity(id = ownerId, keycloakSubject = "sub-owner", displayName = "Owner")
    private fun otherUser() = UserEntity(id = otherId, keycloakSubject = "sub-other", displayName = "Other")

    private fun ownerPrincipal() = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
    private fun otherPrincipal() = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))

    private fun existingEvent(owner: UserEntity = ownerUser()) = EventEntity(
        id = eventId,
        title = "Sommerfest",
        startsAt = Instant.parse("2026-10-01T18:00:00Z"),
        status = EventStatus.draft,
        owner = owner
    )

    private fun approvedDrink(
        version: Int = 3,
        image: String? = "s3://drinks/mate.png"
    ) = DrinkCatalogEntity(
        id = drinkId,
        name = "Club Mate",
        defaultPrice = BigDecimal("2.50"),
        currency = "EUR",
        imageReference = image,
        catalogVersion = version,
        status = DrinkStatus.approved,
        active = true
    )

    @Test
    fun `addEventDrink snapshots price catalogVersion and image from the catalog`() {
        val owner = ownerUser()
        val principal = ownerPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent()))
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(approvedDrink()))
        `when`(eventDrinkRepository.findByEventIdAndDrinkId(eventId, drinkId)).thenReturn(Optional.empty())
        `when`(eventDrinkRepository.save(anyEventDrink())).thenAnswer { it.arguments[0] }

        val dto = service.addEventDrink(
            eventId,
            AddEventDrinkRequest(drinkId = drinkId.toString()),
            principal
        )

        assertEquals(drinkId.toString(), dto.drinkId)
        assertEquals(BigDecimal("2.50"), dto.price)
        assertEquals(3, dto.catalogVersion)
        assertEquals("s3://drinks/mate.png", dto.imageSnapshot)
        assertTrue(dto.selfServiceEnabled)
        assertTrue(dto.tabletEnabled)
    }

    @Test
    fun `addEventDrink applies overrides for price currency and flags`() {
        val owner = ownerUser()
        val principal = ownerPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent()))
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(approvedDrink()))
        `when`(eventDrinkRepository.findByEventIdAndDrinkId(eventId, drinkId)).thenReturn(Optional.empty())
        `when`(eventDrinkRepository.save(anyEventDrink())).thenAnswer { it.arguments[0] }

        val dto = service.addEventDrink(
            eventId,
            AddEventDrinkRequest(
                drinkId = drinkId.toString(),
                price = BigDecimal("3.00"),
                currency = "chf",
                selfServiceEnabled = false,
                tabletEnabled = false
            ),
            principal
        )

        assertEquals(BigDecimal("3.00"), dto.price)
        assertEquals("CHF", dto.currency)
        assertFalse(dto.selfServiceEnabled)
        assertFalse(dto.tabletEnabled)
    }

    @Test
    fun `addEventDrink rejects a non-approved drink`() {
        val owner = ownerUser()
        val principal = ownerPrincipal()
        val proposed = approvedDrink().apply { status = DrinkStatus.proposed }
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent()))
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(proposed))

        assertThrows(InvalidRequestException::class.java) {
            service.addEventDrink(eventId, AddEventDrinkRequest(drinkId = drinkId.toString()), principal)
        }
    }

    @Test
    fun `addEventDrink denies a non-owner member`() {
        val other = otherUser()
        val principal = otherPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent()))

        assertThrows(AccessDeniedException::class.java) {
            service.addEventDrink(eventId, AddEventDrinkRequest(drinkId = drinkId.toString()), principal)
        }
    }

    @Test
    fun `addEventDrink rejects a duplicate drink in the event selection`() {
        val owner = ownerUser()
        val principal = ownerPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent()))
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(approvedDrink()))
        `when`(eventDrinkRepository.findByEventIdAndDrinkId(eventId, drinkId))
            .thenReturn(Optional.of(EventDrinkEntity(id = eventDrinkId)))

        assertThrows(InvalidRequestException::class.java) {
            service.addEventDrink(eventId, AddEventDrinkRequest(drinkId = drinkId.toString()), principal)
        }
    }

    @Test
    fun `assignSublist copies approved items into the event without touching the template`() {
        val owner = ownerUser()
        val principal = ownerPrincipal()
        val drink = approvedDrink(version = 5, image = "s3://drinks/mate.png")
        val sublist = DrinkSublistEntity(id = sublistId, name = "Standardkarte", createdBy = owner)
        val item = DrinkSublistItemEntity(
            id = UUID.randomUUID(),
            sublist = sublist,
            drink = drink,
            defaultPrice = BigDecimal("1.80")
        )
        val saved = mutableListOf<EventDrinkEntity>()

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent()))
        `when`(drinkSublistRepository.findById(sublistId)).thenReturn(Optional.of(sublist))
        `when`(drinkSublistItemRepository.findBySublistId(sublistId)).thenReturn(listOf(item))
        `when`(eventDrinkRepository.findByEventIdAndDrinkId(eventId, drinkId)).thenReturn(Optional.empty())
        `when`(eventDrinkRepository.save(anyEventDrink())).thenAnswer {
            val entity = it.arguments[0] as EventDrinkEntity
            saved.add(entity)
            entity
        }
        `when`(eventDrinkRepository.findByEventId(eventId)).thenReturn(saved)

        val result = service.assignSublist(eventId, AssignSublistRequest(sublistId = sublistId.toString()), principal)

        assertEquals(1, result.size)
        assertEquals(BigDecimal("1.80"), result[0].price)
        assertEquals(5, result[0].catalogVersion)
        assertEquals("s3://drinks/mate.png", result[0].imageSnapshot)
        verify(eventDrinkRepository).save(anyEventDrink())
    }

    @Test
    fun `assignSublist skips drinks already present in the event`() {
        val owner = ownerUser()
        val principal = ownerPrincipal()
        val drink = approvedDrink()
        val sublist = DrinkSublistEntity(id = sublistId, name = "Standardkarte", createdBy = owner)
        val item = DrinkSublistItemEntity(id = UUID.randomUUID(), sublist = sublist, drink = drink)

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent()))
        `when`(drinkSublistRepository.findById(sublistId)).thenReturn(Optional.of(sublist))
        `when`(drinkSublistItemRepository.findBySublistId(sublistId)).thenReturn(listOf(item))
        `when`(eventDrinkRepository.findByEventIdAndDrinkId(eventId, drinkId))
            .thenReturn(Optional.of(EventDrinkEntity(id = eventDrinkId)))
        `when`(eventDrinkRepository.findByEventId(eventId)).thenReturn(emptyList())

        service.assignSublist(eventId, AssignSublistRequest(sublistId = sublistId.toString()), principal)

        verify(eventDrinkRepository, never()).save(anyEventDrink())
    }

    @Test
    fun `assignSublist denies a foreign sublist for a non-privileged owner`() {
        val owner = ownerUser()
        val principal = ownerPrincipal()
        val foreignSublist = DrinkSublistEntity(id = sublistId, name = "Fremd", createdBy = otherUser())

        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent()))
        `when`(drinkSublistRepository.findById(sublistId)).thenReturn(Optional.of(foreignSublist))

        assertThrows(AccessDeniedException::class.java) {
            service.assignSublist(eventId, AssignSublistRequest(sublistId = sublistId.toString()), principal)
        }
    }

    @Test
    fun `updateEventDrink changes price and flags`() {
        val owner = ownerUser()
        val principal = ownerPrincipal()
        val eventDrink = EventDrinkEntity(
            id = eventDrinkId,
            event = existingEvent(),
            drink = approvedDrink(),
            price = BigDecimal("2.50"),
            currency = "EUR"
        )
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent()))
        `when`(eventDrinkRepository.findById(eventDrinkId)).thenReturn(Optional.of(eventDrink))
        `when`(eventDrinkRepository.save(anyEventDrink())).thenAnswer { it.arguments[0] }

        val dto = service.updateEventDrink(
            eventId,
            eventDrinkId,
            UpdateEventDrinkRequest(price = BigDecimal("2.00"), tabletEnabled = false),
            principal
        )

        assertEquals(BigDecimal("2.00"), dto.price)
        assertFalse(dto.tabletEnabled)
    }

    @Test
    fun `updateEventDrink rejects an event drink from a foreign event`() {
        val owner = ownerUser()
        val principal = ownerPrincipal()
        val foreignEvent = EventEntity(id = UUID.randomUUID(), title = "Fremd", owner = owner)
        val eventDrink = EventDrinkEntity(id = eventDrinkId, event = foreignEvent, drink = approvedDrink())
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent()))
        `when`(eventDrinkRepository.findById(eventDrinkId)).thenReturn(Optional.of(eventDrink))

        assertThrows(ResourceNotFoundException::class.java) {
            service.updateEventDrink(eventId, eventDrinkId, UpdateEventDrinkRequest(price = BigDecimal("2.00")), principal)
        }
    }

    @Test
    fun `listEventDrinks denies a user who cannot view the event`() {
        val other = otherUser()
        val principal = otherPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(existingEvent()))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherId)).thenReturn(Optional.empty())

        assertThrows(AccessDeniedException::class.java) {
            service.listEventDrinks(eventId, principal)
        }
    }
}
