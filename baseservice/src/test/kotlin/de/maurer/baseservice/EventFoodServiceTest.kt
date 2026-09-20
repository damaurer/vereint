package de.maurer.baseservice

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventFoodEntity
import de.maurer.baseservice.domain.FoodCatalogEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AddEventFoodRequest
import de.maurer.baseservice.dto.UpdateEventFoodRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.repository.EventFoodRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.FoodCatalogRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.EventFoodService
import de.maurer.baseservice.service.UserService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.Mockito.`when`
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.junit.jupiter.MockitoSettings
import org.mockito.quality.Strictness
import java.math.BigDecimal
import java.util.Optional
import java.util.UUID

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EventFoodServiceTest {

    @Mock
    private lateinit var eventFoodRepository: EventFoodRepository

    @Mock
    private lateinit var eventRepository: EventRepository

    @Mock
    private lateinit var eventParticipantRepository: EventParticipantRepository

    @Mock
    private lateinit var foodCatalogRepository: FoodCatalogRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    private lateinit var service: EventFoodService

    private val ownerId = UUID.randomUUID()
    private val eventId = UUID.randomUUID()
    private val foodId = UUID.randomUUID()

    private fun owner(): UserEntity = UserEntity(id = ownerId, displayName = "Event Owner")
    private fun ownerPrincipal() = UserPrincipal(subject = "owner", email = "owner@example.com", roles = setOf(UserRole.MEMBER))
    private fun event(): EventEntity = EventEntity(id = eventId, title = "Sommerfest", owner = owner())
    private fun food(): FoodCatalogEntity = FoodCatalogEntity(
        id = foodId,
        name = "Pommes",
        defaultPrice = BigDecimal("3.00"),
        costPrice = BigDecimal("1.00"),
        currency = "EUR"
    )

    @BeforeEach
    fun setup() {
        service = EventFoodService(
            eventFoodRepository,
            eventRepository,
            eventParticipantRepository,
            foodCatalogRepository,
            userRoleRepository,
            userService
        )
    }

    @Test
    fun `event owner can add food without override and gets fallback prices`() {
        `when`(userService.getOrCreateUser(ownerPrincipal())).thenReturn(owner())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event()))
        `when`(foodCatalogRepository.findById(foodId)).thenReturn(Optional.of(food()))
        `when`(eventFoodRepository.findByEventIdAndFoodId(eventId, foodId)).thenReturn(Optional.empty())
        `when`(eventFoodRepository.save(org.mockito.ArgumentMatchers.any(EventFoodEntity::class.java))).thenAnswer {
            val entity = it.arguments[0] as EventFoodEntity
            entity.id = UUID.randomUUID()
            entity
        }

        val request = AddEventFoodRequest(foodId = foodId.toString())
        val dto = service.addEventFood(eventId, request, ownerPrincipal())

        assertNull(dto.price)
        assertEquals(0, BigDecimal("3.00").compareTo(dto.effectivePrice))
        assertNull(dto.costPrice)
        assertEquals(0, BigDecimal("1.00").compareTo(dto.effectiveCostPrice))
        assertTrue(dto.selfServiceEnabled)
        assertTrue(dto.tabletEnabled)
    }

    @Test
    fun `event owner can add food with explicit price override`() {
        `when`(userService.getOrCreateUser(ownerPrincipal())).thenReturn(owner())
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event()))
        `when`(foodCatalogRepository.findById(foodId)).thenReturn(Optional.of(food()))
        `when`(eventFoodRepository.findByEventIdAndFoodId(eventId, foodId)).thenReturn(Optional.empty())
        `when`(eventFoodRepository.save(org.mockito.ArgumentMatchers.any(EventFoodEntity::class.java))).thenAnswer {
            val entity = it.arguments[0] as EventFoodEntity
            entity.id = UUID.randomUUID()
            entity
        }

        val request = AddEventFoodRequest(
            foodId = foodId.toString(),
            price = BigDecimal("3.50"),
            costPrice = BigDecimal("1.50")
        )
        val dto = service.addEventFood(eventId, request, ownerPrincipal())

        assertEquals(0, BigDecimal("3.50").compareTo(dto.price))
        assertEquals(0, BigDecimal("3.50").compareTo(dto.effectivePrice))
        assertEquals(0, BigDecimal("1.50").compareTo(dto.costPrice))
        assertEquals(0, BigDecimal("1.50").compareTo(dto.effectiveCostPrice))
    }

    @Test
    fun `non owner non board cannot manage event food`() {
        val otherUser = UserEntity(id = UUID.randomUUID(), displayName = "Stranger")
        val otherPrincipal = UserPrincipal(subject = "stranger", email = "other@example.com", roles = setOf(UserRole.MEMBER))

        `when`(userService.getOrCreateUser(otherPrincipal)).thenReturn(otherUser)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event()))

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.addEventFood(eventId, AddEventFoodRequest(foodId = foodId.toString()), otherPrincipal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }
}
