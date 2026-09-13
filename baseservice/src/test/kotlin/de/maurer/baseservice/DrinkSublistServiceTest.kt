package de.maurer.baseservice

import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.DrinkSublistEntity
import de.maurer.baseservice.domain.DrinkSublistItemEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AddSublistItemRequest
import de.maurer.baseservice.dto.CreateSublistRequest
import de.maurer.baseservice.dto.UpdateSublistRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.DrinkSublistItemRepository
import de.maurer.baseservice.repository.DrinkSublistRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.DrinkSublistService
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
import java.util.*

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DrinkSublistServiceTest {

    @Mock
    private lateinit var drinkSublistRepository: DrinkSublistRepository

    @Mock
    private lateinit var drinkSublistItemRepository: DrinkSublistItemRepository

    @Mock
    private lateinit var drinkCatalogRepository: DrinkCatalogRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    private lateinit var service: DrinkSublistService

    private val ownerId: UUID = UUID.randomUUID()
    private val otherId: UUID = UUID.randomUUID()
    private val boardId: UUID = UUID.randomUUID()
    private val sublistId: UUID = UUID.randomUUID()
    private val drinkId: UUID = UUID.randomUUID()
    private val itemId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        service = DrinkSublistService(
            drinkSublistRepository,
            drinkSublistItemRepository,
            drinkCatalogRepository,
            userRoleRepository,
            userService
        )
        `when`(userRoleRepository.findByIdUserId(any(UUID::class.java) ?: ownerId)).thenReturn(emptyList())
        `when`(drinkSublistItemRepository.findBySublistId(any(UUID::class.java) ?: sublistId)).thenReturn(emptyList())
        `when`(drinkSublistItemRepository.countBySublistId(any(UUID::class.java) ?: sublistId)).thenReturn(0L)
    }

    private fun anySublist(): DrinkSublistEntity = any(DrinkSublistEntity::class.java) ?: DrinkSublistEntity()
    private fun anyItem(): DrinkSublistItemEntity = any(DrinkSublistItemEntity::class.java) ?: DrinkSublistItemEntity()

    private fun ownerUser() = UserEntity(id = ownerId, keycloakSubject = "sub-owner", displayName = "Owner")
    private fun otherUser() = UserEntity(id = otherId, keycloakSubject = "sub-other", displayName = "Other")
    private fun boardUser() = UserEntity(id = boardId, keycloakSubject = "sub-board", displayName = "Board")

    private fun memberPrincipal() = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
    private fun otherPrincipal() = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
    private fun boardPrincipal() = UserPrincipal(subject = "sub-board", roles = setOf(UserRole.BOARD))

    private fun existingSublist(creator: UserEntity? = ownerUser()) = DrinkSublistEntity(
        id = sublistId,
        name = "Standardkarte",
        createdBy = creator
    )

    private fun approvedDrink() = DrinkCatalogEntity(
        id = drinkId,
        name = "Club Mate",
        defaultPrice = BigDecimal("2.50"),
        currency = "EUR",
        status = DrinkStatus.approved,
        active = true
    )

    @Test
    fun `createSublist stores sublist with caller as creator`() {
        val owner = ownerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(drinkSublistRepository.save(anySublist())).thenAnswer { it.arguments[0] }

        val dto = service.createSublist(CreateSublistRequest(name = "  Standardkarte "), principal)

        assertEquals("Standardkarte", dto.name)
        assertEquals(ownerId.toString(), dto.createdById)
        verify(drinkSublistRepository).save(anySublist())
    }

    @Test
    fun `createSublist rejects a blank name`() {
        val owner = ownerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)

        assertThrows(InvalidRequestException::class.java) {
            service.createSublist(CreateSublistRequest(name = "   "), principal)
        }
    }

    @Test
    fun `updateSublist denies a non-creator member`() {
        val other = otherUser()
        val principal = otherPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(drinkSublistRepository.findById(sublistId)).thenReturn(Optional.of(existingSublist()))

        assertThrows(AccessDeniedException::class.java) {
            service.updateSublist(sublistId, UpdateSublistRequest(name = "Neu"), principal)
        }
    }

    @Test
    fun `updateSublist allows board to moderate a foreign sublist`() {
        val board = boardUser()
        val principal = boardPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(board)
        `when`(drinkSublistRepository.findById(sublistId)).thenReturn(Optional.of(existingSublist()))
        `when`(drinkSublistRepository.save(anySublist())).thenAnswer { it.arguments[0] }

        val dto = service.updateSublist(sublistId, UpdateSublistRequest(name = "Moderiert"), principal)

        assertEquals("Moderiert", dto.name)
    }

    @Test
    fun `addItem copies an approved drink into the sublist`() {
        val owner = ownerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(drinkSublistRepository.findById(sublistId)).thenReturn(Optional.of(existingSublist()))
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(approvedDrink()))
        `when`(drinkSublistItemRepository.findBySublistIdAndDrinkId(sublistId, drinkId)).thenReturn(Optional.empty())
        `when`(drinkSublistItemRepository.save(anyItem())).thenAnswer { it.arguments[0] }

        val dto = service.addItem(
            sublistId,
            AddSublistItemRequest(drinkId = drinkId.toString(), defaultPrice = BigDecimal("2.00")),
            principal
        )

        assertEquals(drinkId.toString(), dto.drinkId)
        assertEquals("Club Mate", dto.drinkName)
        assertEquals(BigDecimal("2.00"), dto.defaultPrice)
    }

    @Test
    fun `addItem rejects a drink that is not approved`() {
        val owner = ownerUser()
        val principal = memberPrincipal()
        val proposed = approvedDrink().apply { status = DrinkStatus.proposed }
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(drinkSublistRepository.findById(sublistId)).thenReturn(Optional.of(existingSublist()))
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(proposed))

        assertThrows(InvalidRequestException::class.java) {
            service.addItem(sublistId, AddSublistItemRequest(drinkId = drinkId.toString()), principal)
        }
    }

    @Test
    fun `addItem rejects a duplicate drink`() {
        val owner = ownerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(drinkSublistRepository.findById(sublistId)).thenReturn(Optional.of(existingSublist()))
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(approvedDrink()))
        `when`(drinkSublistItemRepository.findBySublistIdAndDrinkId(sublistId, drinkId))
            .thenReturn(Optional.of(DrinkSublistItemEntity(id = itemId)))

        assertThrows(InvalidRequestException::class.java) {
            service.addItem(sublistId, AddSublistItemRequest(drinkId = drinkId.toString()), principal)
        }
    }

    @Test
    fun `removeItem rejects an item from a foreign sublist`() {
        val owner = ownerUser()
        val principal = memberPrincipal()
        val otherSublist = DrinkSublistEntity(id = UUID.randomUUID(), name = "Fremd", createdBy = owner)
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(drinkSublistRepository.findById(sublistId)).thenReturn(Optional.of(existingSublist()))
        `when`(drinkSublistItemRepository.findById(itemId))
            .thenReturn(Optional.of(DrinkSublistItemEntity(id = itemId, sublist = otherSublist)))

        assertThrows(ResourceNotFoundException::class.java) {
            service.removeItem(sublistId, itemId, principal)
        }
    }

    @Test
    fun `getSublist rejects an unknown sublist`() {
        val owner = ownerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(drinkSublistRepository.findById(sublistId)).thenReturn(Optional.empty())

        assertThrows(ResourceNotFoundException::class.java) {
            service.getSublist(sublistId, principal)
        }
    }
}
