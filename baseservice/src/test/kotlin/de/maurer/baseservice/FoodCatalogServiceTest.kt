package de.maurer.baseservice

import de.maurer.baseservice.domain.FoodCatalogEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateFoodRequest
import de.maurer.baseservice.dto.UpdateFoodRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.repository.FoodCatalogRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.FoodCatalogService
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
class FoodCatalogServiceTest {

    @Mock
    private lateinit var foodCatalogRepository: FoodCatalogRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    private lateinit var service: FoodCatalogService

    private val adminId = UUID.randomUUID()
    private val memberId = UUID.randomUUID()

    private fun admin(): UserEntity = UserEntity(id = adminId, displayName = "Admin")
    private fun member(): UserEntity = UserEntity(id = memberId, displayName = "Member")

    private fun adminPrincipal() = UserPrincipal(subject = "admin", email = "admin@example.com", roles = setOf(UserRole.ADMIN))
    private fun memberPrincipal() = UserPrincipal(subject = "member", email = "member@example.com", roles = setOf(UserRole.MEMBER))

    @BeforeEach
    fun setup() {
        service = FoodCatalogService(foodCatalogRepository, userRoleRepository, userService)
    }

    @Test
    fun `board or admin can create food with default and cost price`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())
        `when`(foodCatalogRepository.save(org.mockito.ArgumentMatchers.any(FoodCatalogEntity::class.java))).thenAnswer {
            val entity = it.arguments[0] as FoodCatalogEntity
            entity.id = UUID.randomUUID()
            entity
        }

        val request = CreateFoodRequest(
            name = "Bratwurst",
            description = "Vom Holzkohlegrill",
            category = "Grill",
            defaultPrice = BigDecimal("3.50"),
            costPrice = BigDecimal("1.20"),
            currency = "eur"
        )

        val dto = service.createFood(request, adminPrincipal())

        assertEquals("Bratwurst", dto.name)
        assertEquals("Grill", dto.category)
        assertEquals(0, BigDecimal("3.50").compareTo(dto.defaultPrice))
        assertEquals(0, BigDecimal("1.20").compareTo(dto.costPrice))
        assertEquals("EUR", dto.currency)
        assertTrue(dto.active)
    }

    @Test
    fun `regular member cannot create food`() {
        `when`(userService.getOrCreateUser(memberPrincipal())).thenReturn(member())

        val request = CreateFoodRequest(
            name = "Bratwurst",
            defaultPrice = BigDecimal("3.50")
        )

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.createFood(request, memberPrincipal())
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `cannot create food with negative prices`() {
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.createFood(
                CreateFoodRequest(name = "Test", defaultPrice = BigDecimal("-1.00")),
                adminPrincipal()
            )
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)

        val exCost = assertThrows(InvalidRequestException::class.java) {
            service.createFood(
                CreateFoodRequest(name = "Test", defaultPrice = BigDecimal("2.00"), costPrice = BigDecimal("-0.50")),
                adminPrincipal()
            )
        }
        assertEquals(ErrorCode.INVALID_REQUEST, exCost.errorCode)
    }

    @Test
    fun `board or admin can update food prices`() {
        val foodId = UUID.randomUUID()
        val existing = FoodCatalogEntity(
            id = foodId,
            name = "Steak",
            defaultPrice = BigDecimal("5.00"),
            costPrice = BigDecimal("2.50"),
            currency = "EUR"
        )
        `when`(userService.getOrCreateUser(adminPrincipal())).thenReturn(admin())
        `when`(foodCatalogRepository.findById(foodId)).thenReturn(Optional.of(existing))
        `when`(foodCatalogRepository.save(org.mockito.ArgumentMatchers.any(FoodCatalogEntity::class.java))).thenAnswer { it.arguments[0] }

        val updated = service.updateFood(
            foodId,
            UpdateFoodRequest(defaultPrice = BigDecimal("6.00"), costPrice = BigDecimal("3.00")),
            adminPrincipal()
        )

        assertEquals(0, BigDecimal("6.00").compareTo(updated.defaultPrice))
        assertEquals(0, BigDecimal("3.00").compareTo(updated.costPrice))
    }
}
