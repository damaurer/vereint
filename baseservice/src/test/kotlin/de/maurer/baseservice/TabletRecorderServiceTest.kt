package de.maurer.baseservice

import de.maurer.baseservice.domain.*
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.*
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.LedgerService
import de.maurer.baseservice.service.TabletRecorderService
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
import java.util.Optional
import java.util.UUID

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TabletRecorderServiceTest {

    @Mock
    private lateinit var eventRepository: EventRepository

    @Mock
    private lateinit var eventDrinkRepository: EventDrinkRepository

    @Mock
    private lateinit var eventFoodRepository: EventFoodRepository

    @Mock
    private lateinit var eventParticipantRepository: EventParticipantRepository

    @Mock
    private lateinit var userRepository: UserRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    @Mock
    private lateinit var ledgerService: LedgerService

    private lateinit var service: TabletRecorderService

    private val recorderId: UUID = UUID.randomUUID()
    private val memberId: UUID = UUID.randomUUID()
    private val ownerId: UUID = UUID.randomUUID()
    private val eventId: UUID = UUID.randomUUID()
    private val eventDrinkId: UUID = UUID.randomUUID()
    private val drinkId: UUID = UUID.randomUUID()

    private fun recorder() = UserEntity(id = recorderId, keycloakSubject = "sub-tablet", displayName = "Tablet")

    private fun member() = UserEntity(id = memberId, keycloakSubject = "sub-member", displayName = "Bob")

    private fun owner() = UserEntity(id = ownerId, keycloakSubject = "sub-owner", displayName = "Alice")

    private fun recorderPrincipal() = UserPrincipal(subject = "sub-tablet", roles = setOf("tabletRecorder"))

    private fun memberPrincipal() = UserPrincipal(subject = "sub-member", roles = setOf("member"))

    private fun activeEvent() = EventEntity(id = eventId, title = "Sommerfest", status = EventStatus.active, owner = owner())

    private fun drink() = DrinkCatalogEntity(id = drinkId, name = "Cola")

    private fun eventDrink(tabletEnabled: Boolean = true) = EventDrinkEntity(
        id = eventDrinkId,
        event = activeEvent(),
        drink = drink(),
        price = BigDecimal("2.50"),
        currency = "EUR",
        selfServiceEnabled = true,
        tabletEnabled = tabletEnabled,
        catalogVersion = 3,
        imageSnapshot = "s3://drinks/cola-v3.png"
    )

    private fun sampleEntry() = LedgerEntryDto(
        id = UUID.randomUUID().toString(),
        entryType = "purchase",
        eventId = eventId.toString(),
        memberId = memberId.toString(),
        memberDisplayName = "Bob",
        drinkId = drinkId.toString(),
        amount = BigDecimal("2.50"),
        currency = "EUR",
        accountingMode = "credit",
        source = "tabletManual",
        actorId = recorderId.toString(),
        reversesEntryId = null,
        idempotencyKey = "idem-1",
        createdAt = Instant.now(),
        snapshot = null
    )

    @BeforeEach
    fun setup() {
        service = TabletRecorderService(
            eventRepository,
            eventDrinkRepository,
            eventFoodRepository,
            eventParticipantRepository,
            userRepository,
            userRoleRepository,
            userService,
            ledgerService
        )
    }

    @Test
    fun `records a manual purchase for an event participant`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, memberId))
            .thenReturn(Optional.of(EventParticipantEntity(event = activeEvent(), user = member())))
        `when`(eventDrinkRepository.findById(eventDrinkId)).thenReturn(Optional.of(eventDrink()))
        `when`(
            ledgerService.recordTabletPurchase(
                any(EventEntity::class.java) ?: activeEvent(),
                any(UserEntity::class.java) ?: member(),
                any(DrinkCatalogEntity::class.java) ?: drink(),
                any(EventDrinkEntity::class.java) ?: eventDrink(),
                any(UserEntity::class.java) ?: recorder(),
                anyString()
            )
        ).thenReturn(sampleEntry())

        val dto = service.recordPurchase(
            eventId,
            TabletPurchaseRequest(memberId = memberId.toString(), eventDrinkId = eventDrinkId.toString()),
            "idem-1",
            recorderPrincipal()
        )

        assertEquals("purchase", dto.entryType)
        assertEquals("tabletManual", dto.source)
        assertEquals(memberId.toString(), dto.memberId)
        verify(ledgerService).recordTabletPurchase(
            any(EventEntity::class.java) ?: activeEvent(),
            any(UserEntity::class.java) ?: member(),
            any(DrinkCatalogEntity::class.java) ?: drink(),
            any(EventDrinkEntity::class.java) ?: eventDrink(),
            any(UserEntity::class.java) ?: recorder(),
            anyString()
        )
    }

    private fun revenueEntry(source: PurchaseSource, member: UUID) = LedgerEntryDto(
        id = UUID.randomUUID().toString(),
        entryType = "purchase",
        eventId = eventId.toString(),
        memberId = member.toString(),
        memberDisplayName = "X",
        drinkId = drinkId.toString(),
        amount = BigDecimal("2.50"),
        currency = "EUR",
        accountingMode = "revenueOnly",
        source = source.name,
        actorId = recorderId.toString(),
        reversesEntryId = null,
        idempotencyKey = "idem",
        createdAt = Instant.now(),
        snapshot = null
    )

    @Test
    fun `records a round as revenue only for every event member`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))
        `when`(userRepository.findById(ownerId)).thenReturn(Optional.of(owner()))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, memberId))
            .thenReturn(Optional.of(EventParticipantEntity(event = activeEvent(), user = member())))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, ownerId)).thenReturn(Optional.empty())
        `when`(eventDrinkRepository.findById(eventDrinkId)).thenReturn(Optional.of(eventDrink()))
        `when`(
            ledgerService.recordEventRevenuePurchase(
                any(EventEntity::class.java) ?: activeEvent(),
                any(UserEntity::class.java) ?: member(),
                any(DrinkCatalogEntity::class.java) ?: drink(),
                any(EventDrinkEntity::class.java) ?: eventDrink(),
                any(UserEntity::class.java) ?: recorder(),
                any(PurchaseSource::class.java) ?: PurchaseSource.round,
                anyString()
            )
        ).thenReturn(revenueEntry(PurchaseSource.round, memberId), revenueEntry(PurchaseSource.round, ownerId))

        val entries = service.recordRound(
            eventId,
            TabletRevenuePurchaseRequest(
                eventDrinkId = eventDrinkId.toString(),
                memberIds = listOf(memberId.toString(), ownerId.toString())
            ),
            "round-key",
            recorderPrincipal()
        )

        assertEquals(2, entries.size)
        assertTrue(entries.all { it.accountingMode == "revenueOnly" })
        assertTrue(entries.all { it.source == "round" })
        verify(ledgerService, times(2)).recordEventRevenuePurchase(
            any(EventEntity::class.java) ?: activeEvent(),
            any(UserEntity::class.java) ?: member(),
            any(DrinkCatalogEntity::class.java) ?: drink(),
            any(EventDrinkEntity::class.java) ?: eventDrink(),
            any(UserEntity::class.java) ?: recorder(),
            eq(PurchaseSource.round) ?: PurchaseSource.round,
            anyString()
        )
    }

    @Test
    fun `records an evening action with the evening source`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, memberId))
            .thenReturn(Optional.of(EventParticipantEntity(event = activeEvent(), user = member())))
        `when`(eventDrinkRepository.findById(eventDrinkId)).thenReturn(Optional.of(eventDrink()))
        `when`(
            ledgerService.recordEventRevenuePurchase(
                any(EventEntity::class.java) ?: activeEvent(),
                any(UserEntity::class.java) ?: member(),
                any(DrinkCatalogEntity::class.java) ?: drink(),
                any(EventDrinkEntity::class.java) ?: eventDrink(),
                any(UserEntity::class.java) ?: recorder(),
                any(PurchaseSource::class.java) ?: PurchaseSource.evening,
                anyString()
            )
        ).thenReturn(revenueEntry(PurchaseSource.evening, memberId))

        val entries = service.recordEvening(
            eventId,
            TabletRevenuePurchaseRequest(
                eventDrinkId = eventDrinkId.toString(),
                memberIds = listOf(memberId.toString())
            ),
            "evening-key",
            recorderPrincipal()
        )

        assertEquals(1, entries.size)
        assertEquals("evening", entries[0].source)
        verify(ledgerService).recordEventRevenuePurchase(
            any(EventEntity::class.java) ?: activeEvent(),
            any(UserEntity::class.java) ?: member(),
            any(DrinkCatalogEntity::class.java) ?: drink(),
            any(EventDrinkEntity::class.java) ?: eventDrink(),
            any(UserEntity::class.java) ?: recorder(),
            eq(PurchaseSource.evening) ?: PurchaseSource.evening,
            anyString()
        )
    }

    @Test
    fun `round is denied for a caller without the tablet permission`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.recordRound(
                eventId,
                TabletRevenuePurchaseRequest(
                    eventDrinkId = eventDrinkId.toString(),
                    memberIds = listOf(memberId.toString())
                ),
                "round-key",
                memberPrincipal()
            )
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        verifyNoInteractions(ledgerService)
    }

    @Test
    fun `round is rejected when no members are given`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        `when`(eventDrinkRepository.findById(eventDrinkId)).thenReturn(Optional.of(eventDrink()))

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.recordRound(
                eventId,
                TabletRevenuePurchaseRequest(eventDrinkId = eventDrinkId.toString(), memberIds = emptyList()),
                "round-key",
                recorderPrincipal()
            )
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
        verifyNoInteractions(ledgerService)
    }

    @Test
    fun `purchase is denied for a caller without the tablet permission`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.recordPurchase(
                eventId,
                TabletPurchaseRequest(memberId = memberId.toString(), eventDrinkId = eventDrinkId.toString()),
                "idem-1",
                memberPrincipal()
            )
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        verifyNoInteractions(ledgerService)
    }

    @Test
    fun `purchase is rejected when the event is not active`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        val draft = EventEntity(id = eventId, title = "Sommerfest", status = EventStatus.draft, owner = owner())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(draft))

        val ex = assertThrows(EventNotActiveException::class.java) {
            service.recordPurchase(
                eventId,
                TabletPurchaseRequest(memberId = memberId.toString(), eventDrinkId = eventDrinkId.toString()),
                "idem-1",
                recorderPrincipal()
            )
        }
        assertEquals(ErrorCode.EVENT_NOT_ACTIVE, ex.errorCode)
        verifyNoInteractions(ledgerService)
    }

    @Test
    fun `purchase is rejected when the buyer is not an event member`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, memberId)).thenReturn(Optional.empty())

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.recordPurchase(
                eventId,
                TabletPurchaseRequest(memberId = memberId.toString(), eventDrinkId = eventDrinkId.toString()),
                "idem-1",
                recorderPrincipal()
            )
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
        verifyNoInteractions(ledgerService)
    }

    @Test
    fun `purchase is rejected when the drink is not tablet enabled`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, memberId))
            .thenReturn(Optional.of(EventParticipantEntity(event = activeEvent(), user = member())))
        `when`(eventDrinkRepository.findById(eventDrinkId)).thenReturn(Optional.of(eventDrink(tabletEnabled = false)))

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.recordPurchase(
                eventId,
                TabletPurchaseRequest(memberId = memberId.toString(), eventDrinkId = eventDrinkId.toString()),
                "idem-1",
                recorderPrincipal()
            )
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
        verifyNoInteractions(ledgerService)
    }

    @Test
    fun `lists active events for the recorder`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        `when`(eventRepository.findByStatus(EventStatus.active)).thenReturn(listOf(activeEvent()))

        val events = service.listActiveEvents(recorderPrincipal())

        assertEquals(1, events.size)
        assertEquals(eventId.toString(), events[0].id)
        assertEquals("active", events[0].status)
    }

    @Test
    fun `lists event members combining owner and participants without duplicates and disabled`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        val disabledMember = UserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = "sub-disabled",
            displayName = "Zoe",
            disabled = true
        )
        `when`(eventParticipantRepository.findByEventId(eventId)).thenReturn(
            listOf(
                EventParticipantEntity(event = activeEvent(), user = member()),
                EventParticipantEntity(event = activeEvent(), user = owner()),
                EventParticipantEntity(event = activeEvent(), user = disabledMember)
            )
        )

        val members = service.listEventMembers(eventId, recorderPrincipal())

        assertEquals(2, members.size)
        assertEquals(setOf(ownerId.toString(), memberId.toString()), members.map { it.memberId }.toSet())
    }

    @Test
    fun `lists only tablet enabled event drinks`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        val disabledDrink = EventDrinkEntity(
            id = UUID.randomUUID(),
            event = activeEvent(),
            drink = DrinkCatalogEntity(id = UUID.randomUUID(), name = "Wasser"),
            price = BigDecimal("1.00"),
            currency = "EUR",
            tabletEnabled = false
        )
        `when`(eventDrinkRepository.findByEventId(eventId)).thenReturn(listOf(eventDrink(), disabledDrink))

        val drinks = service.listTabletDrinks(eventId, recorderPrincipal())

        assertEquals(1, drinks.size)
        assertEquals(eventDrinkId.toString(), drinks[0].id)
        assertTrue(drinks[0].tabletEnabled)
    }

    @Test
    fun `records a manual food purchase for an event participant`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        `when`(userRepository.findById(memberId)).thenReturn(Optional.of(member()))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, memberId)).thenReturn(
            Optional.of(EventParticipantEntity(event = activeEvent(), user = member()))
        )

        val foodId = UUID.randomUUID()
        val eventFoodId = UUID.randomUUID()
        val food = FoodCatalogEntity(id = foodId, name = "Brezel", defaultPrice = BigDecimal("2.00"))
        val eventFood = EventFoodEntity(id = eventFoodId, event = activeEvent(), food = food, tabletEnabled = true)

        `when`(eventFoodRepository.findById(eventFoodId)).thenReturn(Optional.of(eventFood))
        `when`(
            ledgerService.recordTabletFoodPurchase(
                any(EventEntity::class.java) ?: activeEvent(),
                any(UserEntity::class.java) ?: member(),
                any(FoodCatalogEntity::class.java) ?: food,
                any(EventFoodEntity::class.java) ?: eventFood,
                any(UserEntity::class.java) ?: recorder(),
                anyString()
            )
        ).thenReturn(sampleEntry())

        val dto = service.recordPurchase(
            eventId,
            TabletPurchaseRequest(memberId = memberId.toString(), eventFoodId = eventFoodId.toString()),
            "idem-food",
            recorderPrincipal()
        )

        assertEquals("purchase", dto.entryType)
        verify(ledgerService).recordTabletFoodPurchase(
            any(EventEntity::class.java) ?: activeEvent(),
            any(UserEntity::class.java) ?: member(),
            any(FoodCatalogEntity::class.java) ?: food,
            any(EventFoodEntity::class.java) ?: eventFood,
            any(UserEntity::class.java) ?: recorder(),
            org.mockito.ArgumentMatchers.eq("idem-food")
        )
    }

    @Test
    fun `lists tablet items including drinks and foods`() {
        `when`(userService.getOrCreateUser(recorderPrincipal())).thenReturn(recorder())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(activeEvent()))
        `when`(eventDrinkRepository.findByEventId(eventId)).thenReturn(listOf(eventDrink()))

        val foodId = UUID.randomUUID()
        val eventFoodId = UUID.randomUUID()
        val food = FoodCatalogEntity(id = foodId, name = "Kuchen", defaultPrice = BigDecimal("2.50"))
        val eventFood = EventFoodEntity(id = eventFoodId, event = activeEvent(), food = food, tabletEnabled = true)
        `when`(eventFoodRepository.findByEventId(eventId)).thenReturn(listOf(eventFood))

        val items = service.listTabletItems(eventId, recorderPrincipal())

        assertEquals(1, items.drinks.size)
        assertEquals(1, items.food.size)
        assertEquals("Kuchen", items.food[0].foodName)
    }
}
