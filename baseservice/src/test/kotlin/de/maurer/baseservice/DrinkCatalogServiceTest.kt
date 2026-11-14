package de.maurer.baseservice

import de.maurer.baseservice.domain.DrinkBarcodeEntity
import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AddBarcodeRequest
import de.maurer.baseservice.dto.ProposeDrinkRequest
import de.maurer.baseservice.dto.UpdateDrinkRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkBarcodeRepository
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.repository.TallyCategoryRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.DrinkCatalogService
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
import java.math.BigDecimal
import java.util.*

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DrinkCatalogServiceTest {

    @Mock
    private lateinit var drinkCatalogRepository: DrinkCatalogRepository

    @Mock
    private lateinit var drinkBarcodeRepository: DrinkBarcodeRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    @Mock
    private lateinit var tallyCategoryRepository: TallyCategoryRepository

    private lateinit var service: DrinkCatalogService

    private val proposerId: UUID = UUID.randomUUID()
    private val boardId: UUID = UUID.randomUUID()
    private val drinkId: UUID = UUID.randomUUID()
    private val barcodeId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        service = DrinkCatalogService(
            drinkCatalogRepository,
            drinkBarcodeRepository,
            StammtischTestSupport.lenientMock(),
            tallyCategoryRepository,
            StammtischTestSupport.access(userRoleRepository),
            userService
        )
        `when`(userRoleRepository.findByIdUserId(any(UUID::class.java) ?: proposerId)).thenReturn(emptyList())
        `when`(drinkBarcodeRepository.findByDrinkId(any(UUID::class.java) ?: drinkId)).thenReturn(emptyList())
        `when`(drinkBarcodeRepository.findByBarcode(anyString())).thenReturn(Optional.empty())
    }

    private fun anyDrink(): DrinkCatalogEntity = any(DrinkCatalogEntity::class.java) ?: DrinkCatalogEntity()
    private fun anyBarcode(): DrinkBarcodeEntity = any(DrinkBarcodeEntity::class.java) ?: DrinkBarcodeEntity()

    private fun proposerUser() = UserEntity(id = proposerId, keycloakSubject = "sub-proposer", displayName = "Proposer")
    private fun boardUser() = UserEntity(id = boardId, keycloakSubject = "sub-board", displayName = "Board")

    private fun memberPrincipal() = UserPrincipal(subject = "sub-proposer", roles = setOf(UserRole.MEMBER))
    private fun boardPrincipal() = UserPrincipal(subject = "sub-board", roles = setOf(UserRole.BOARD))

    private fun existingDrink(
        status: DrinkStatus = DrinkStatus.proposed,
        proposer: UserEntity? = proposerUser(),
        catalogVersion: Int = 1
    ) = DrinkCatalogEntity(
        id = drinkId,
        name = "Club Mate",
        defaultPrice = BigDecimal("2.50"),
        currency = "EUR",
        catalogVersion = catalogVersion,
        active = status == DrinkStatus.approved,
        status = status,
        proposedBy = proposer
    )

    @Test
    fun `proposeDrink stores a proposed inactive drink with the caller as proposer`() {
        val proposer = proposerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(proposer)
        `when`(drinkCatalogRepository.save(anyDrink())).thenAnswer { it.arguments[0] }

        val dto = service.proposeDrink(
            ProposeDrinkRequest(name = "  Club   Mate ", defaultPrice = BigDecimal("2.50")),
            principal
        )

        assertEquals("Club Mate", dto.name)
        assertEquals(DrinkStatus.proposed.name, dto.status)
        assertFalse(dto.active)
        assertEquals(1, dto.catalogVersion)
        assertEquals(proposerId.toString(), dto.proposedById)
        verify(drinkCatalogRepository).save(anyDrink())
    }

    @Test
    fun `proposeDrink normalizes and stores provided barcodes`() {
        val proposer = proposerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(proposer)
        `when`(drinkCatalogRepository.save(anyDrink())).thenAnswer { it.arguments[0] }
        `when`(drinkBarcodeRepository.save(anyBarcode())).thenAnswer { it.arguments[0] }

        service.proposeDrink(
            ProposeDrinkRequest(
                name = "Cola",
                defaultPrice = BigDecimal("1.50"),
                barcodes = listOf(" 4029 764 001807 ")
            ),
            principal
        )

        val captor = org.mockito.ArgumentCaptor.forClass(DrinkBarcodeEntity::class.java)
        verify(drinkBarcodeRepository).save(captor.capture())
        assertEquals("4029764001807", captor.value.barcode)
    }

    @Test
    fun `proposeDrink rejects a duplicate barcode`() {
        val proposer = proposerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(proposer)
        `when`(drinkCatalogRepository.save(anyDrink())).thenAnswer { it.arguments[0] }
        `when`(drinkBarcodeRepository.findByBarcode("123")).thenReturn(
            Optional.of(DrinkBarcodeEntity(barcode = "123"))
        )

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.proposeDrink(
                ProposeDrinkRequest(name = "Fanta", defaultPrice = BigDecimal("1.50"), barcodes = listOf("123")),
                principal
            )
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `proposeDrink by the board creates an approved active drink without a second review`() {
        val board = boardUser()
        val principal = boardPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(board)
        `when`(drinkCatalogRepository.save(anyDrink())).thenAnswer { it.arguments[0] }

        val dto = service.proposeDrink(
            ProposeDrinkRequest(name = "Spezi", defaultPrice = BigDecimal("2.00"), costPrice = BigDecimal("0.90")),
            principal
        )

        assertEquals(DrinkStatus.approved.name, dto.status)
        assertTrue(dto.active)
        assertEquals(boardId.toString(), dto.approvedById)
        assertEquals(0, BigDecimal("0.90").compareTo(dto.costPrice))
    }

    @Test
    fun `proposeDrink checks every barcode before saving the drink`() {
        val proposer = proposerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(proposer)
        `when`(drinkBarcodeRepository.findByBarcode("222")).thenReturn(
            Optional.of(DrinkBarcodeEntity(barcode = "222"))
        )

        assertThrows(InvalidRequestException::class.java) {
            service.proposeDrink(
                ProposeDrinkRequest(name = "Fanta", defaultPrice = BigDecimal("1.50"), barcodes = listOf("111", "222")),
                principal
            )
        }
        verify(drinkCatalogRepository, never()).save(anyDrink())
        verify(drinkBarcodeRepository, never()).save(anyBarcode())
    }

    @Test
    fun `proposeDrink denies a caller without a member role`() {
        val guest = UserEntity(id = proposerId, keycloakSubject = "sub-guest", displayName = "Guest")
        val principal = UserPrincipal(subject = "sub-guest", roles = emptySet())
        `when`(userService.getOrCreateUser(principal)).thenReturn(guest)

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.proposeDrink(ProposeDrinkRequest(name = "X", defaultPrice = BigDecimal.ONE), principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        verify(drinkCatalogRepository, never()).save(anyDrink())
    }

    @Test
    fun `proposeDrink rejects a blank name`() {
        val proposer = proposerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(proposer)

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.proposeDrink(ProposeDrinkRequest(name = "   ", defaultPrice = BigDecimal.ONE), principal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `getDrink allows any member to view an approved drink`() {
        val proposer = proposerUser()
        val other = UserEntity(id = boardId, keycloakSubject = "sub-other", displayName = "Other")
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(drinkCatalogRepository.findById(drinkId))
            .thenReturn(Optional.of(existingDrink(status = DrinkStatus.approved, proposer = proposer)))

        val dto = service.getDrink(drinkId, principal)
        assertEquals(DrinkStatus.approved.name, dto.status)
    }

    @Test
    fun `getDrink denies an unrelated member for a proposed drink`() {
        val other = UserEntity(id = boardId, keycloakSubject = "sub-other", displayName = "Other")
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(drinkCatalogRepository.findById(drinkId))
            .thenReturn(Optional.of(existingDrink(status = DrinkStatus.proposed)))

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.getDrink(drinkId, principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `approveDrink sets approved and active for a board member`() {
        val board = boardUser()
        val principal = boardPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(board)
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(existingDrink()))
        `when`(drinkCatalogRepository.save(anyDrink())).thenAnswer { it.arguments[0] }

        val dto = service.approveDrink(drinkId, principal)

        assertEquals(DrinkStatus.approved.name, dto.status)
        assertTrue(dto.active)
        assertEquals(boardId.toString(), dto.approvedById)
    }

    @Test
    fun `approveDrink denies a plain member`() {
        val proposer = proposerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(proposer)
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(existingDrink()))

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.approveDrink(drinkId, principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        verify(drinkCatalogRepository, never()).save(anyDrink())
    }

    @Test
    fun `rejectDrink marks the drink rejected and inactive for an admin`() {
        val admin = UserEntity(id = boardId, keycloakSubject = "sub-admin", displayName = "Admin")
        val principal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))
        `when`(userService.getOrCreateUser(principal)).thenReturn(admin)
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(existingDrink()))
        `when`(drinkCatalogRepository.save(anyDrink())).thenAnswer { it.arguments[0] }

        val dto = service.rejectDrink(drinkId, principal)

        assertEquals(DrinkStatus.rejected.name, dto.status)
        assertFalse(dto.active)
    }

    @Test
    fun `updateDrink lets the proposer edit an own proposed drink without bumping the catalog version`() {
        val proposer = proposerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(proposer)
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(existingDrink()))
        `when`(drinkCatalogRepository.save(anyDrink())).thenAnswer { it.arguments[0] }

        val dto = service.updateDrink(drinkId, UpdateDrinkRequest(name = "Mate Neu"), principal)

        assertEquals("Mate Neu", dto.name)
        assertEquals(1, dto.catalogVersion)
    }

    @Test
    fun `updateDrink bumps the catalog version when an approved drink changes snapshot fields`() {
        val board = boardUser()
        val principal = boardPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(board)
        `when`(drinkCatalogRepository.findById(drinkId))
            .thenReturn(Optional.of(existingDrink(status = DrinkStatus.approved, catalogVersion = 3)))
        `when`(drinkCatalogRepository.save(anyDrink())).thenAnswer { it.arguments[0] }

        val dto = service.updateDrink(drinkId, UpdateDrinkRequest(defaultPrice = BigDecimal("3.00")), principal)

        assertEquals(4, dto.catalogVersion)
        assertEquals(0, dto.defaultPrice.compareTo(BigDecimal("3.00")))
    }

    @Test
    fun `updateDrink denies a non-owner member`() {
        val other = UserEntity(id = boardId, keycloakSubject = "sub-other", displayName = "Other")
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(existingDrink()))

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.updateDrink(drinkId, UpdateDrinkRequest(name = "Hijack"), principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `updateDrink denies toggling active for a non-privileged proposer`() {
        val proposer = proposerUser()
        val principal = memberPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(proposer)
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(existingDrink()))

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.updateDrink(drinkId, UpdateDrinkRequest(active = true), principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `addBarcode rejects a duplicate barcode`() {
        val board = boardUser()
        val principal = boardPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(board)
        `when`(drinkCatalogRepository.findById(drinkId))
            .thenReturn(Optional.of(existingDrink(status = DrinkStatus.approved)))
        `when`(drinkBarcodeRepository.findByBarcode("111")).thenReturn(Optional.of(DrinkBarcodeEntity(barcode = "111")))

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.addBarcode(drinkId, AddBarcodeRequest(barcode = "111"), principal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
        verify(drinkBarcodeRepository, never()).save(anyBarcode())
    }

    @Test
    fun `removeBarcode reports a barcode that belongs to another drink with 404`() {
        val board = boardUser()
        val principal = boardPrincipal()
        val drink = existingDrink(status = DrinkStatus.approved)
        val foreign = DrinkBarcodeEntity(
            id = barcodeId,
            drink = DrinkCatalogEntity(id = UUID.randomUUID()),
            barcode = "999"
        )
        `when`(userService.getOrCreateUser(principal)).thenReturn(board)
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(Optional.of(drink))
        `when`(drinkBarcodeRepository.findById(barcodeId)).thenReturn(Optional.of(foreign))

        val ex = assertThrows(ResourceNotFoundException::class.java) {
            service.removeBarcode(drinkId, barcodeId, principal)
        }
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode)
        verify(drinkBarcodeRepository, never()).delete(anyBarcode())
    }

    @Test
    fun `getDrinkByBarcode returns the approved drink for an active barcode`() {
        val member = UserEntity(id = boardId, keycloakSubject = "sub-m", displayName = "M")
        val principal = UserPrincipal(subject = "sub-m", roles = setOf(UserRole.MEMBER))
        val drink = existingDrink(status = DrinkStatus.approved)
        `when`(userService.getOrCreateUser(principal)).thenReturn(member)
        `when`(drinkBarcodeRepository.findByBarcode("4029764001807"))
            .thenReturn(Optional.of(DrinkBarcodeEntity(drink = drink, barcode = "4029764001807", active = true)))

        val dto = service.getDrinkByBarcode(" 4029764001807 ", principal)
        assertEquals(drinkId.toString(), dto.id)
    }

    @Test
    fun `getDrinkByBarcode reports an inactive barcode as not found`() {
        val member = UserEntity(id = boardId, keycloakSubject = "sub-m", displayName = "M")
        val principal = UserPrincipal(subject = "sub-m", roles = setOf(UserRole.MEMBER))
        val drink = existingDrink(status = DrinkStatus.approved)
        `when`(userService.getOrCreateUser(principal)).thenReturn(member)
        `when`(drinkBarcodeRepository.findByBarcode("111"))
            .thenReturn(Optional.of(DrinkBarcodeEntity(drink = drink, barcode = "111", active = false)))

        val ex = assertThrows(ResourceNotFoundException::class.java) {
            service.getDrinkByBarcode("111", principal)
        }
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode)
    }

    @Test
    fun `listDrinks denies a member requesting a non-approved status filter`() {
        val member = UserEntity(id = boardId, keycloakSubject = "sub-m", displayName = "M")
        val principal = UserPrincipal(subject = "sub-m", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(member)

        val ex = assertThrows(AccessDeniedException::class.java) {
            service.listDrinks(principal, DrinkStatus.proposed.name)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `listDrinks rejects an unknown status filter`() {
        val board = boardUser()
        val principal = boardPrincipal()
        `when`(userService.getOrCreateUser(principal)).thenReturn(board)

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.listDrinks(principal, "bogus")
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }
}
