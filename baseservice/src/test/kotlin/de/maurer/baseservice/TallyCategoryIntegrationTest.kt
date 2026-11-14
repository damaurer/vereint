package de.maurer.baseservice

import de.maurer.baseservice.domain.DrinkBarcodeEntity
import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateTallyCategoryRequest
import de.maurer.baseservice.dto.PurchasePreviewRequest
import de.maurer.baseservice.dto.PurchaseRequest
import de.maurer.baseservice.dto.ReorderTallyCategoriesRequest
import de.maurer.baseservice.dto.TabletPurchaseRequest
import de.maurer.baseservice.dto.TopupRequest
import de.maurer.baseservice.dto.UpdateDrinkRequest
import de.maurer.baseservice.dto.UpdateTallyCategoryRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkBarcodeRepository
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.EventDrinkRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.DrinkCatalogService
import de.maurer.baseservice.service.LedgerService
import de.maurer.baseservice.service.MembershipService
import de.maurer.baseservice.service.TabletRecorderService
import de.maurer.baseservice.service.TallyCategoryService
import de.maurer.baseservice.service.UserService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import java.math.BigDecimal
import java.util.UUID

/**
 * Strich-Kategorien (Issue #80) gegen die echten Migrationen (H2-Profil `test`):
 * Verwaltung, Zuordnung von Getränken, Preisermittlung im Event
 * (Kategoriepreis > Event-Preis > Getränkepreis), Strich am Terminal mit
 * Getränk und Kategorie, Kauf per Scan und Rückgängig.
 */
@SpringBootTest
@ActiveProfiles("test")
class TallyCategoryIntegrationTest @Autowired constructor(
    private val tallyCategoryService: TallyCategoryService,
    private val drinkCatalogService: DrinkCatalogService,
    private val tabletRecorderService: TabletRecorderService,
    private val ledgerService: LedgerService,
    private val userService: UserService,
    private val membershipService: MembershipService,
    private val userRepository: UserRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val drinkBarcodeRepository: DrinkBarcodeRepository,
    private val eventDrinkRepository: EventDrinkRepository,
    private val ledgerEntryRepository: LedgerEntryRepository
) {

    private val board = UserPrincipal(
        subject = "kc-tally-board-${UUID.randomUUID()}",
        displayName = "Vorstand",
        roles = setOf(UserRole.BOARD, UserRole.MEMBER)
    )
    private val terminal = UserPrincipal(
        subject = "kc-tally-terminal-${UUID.randomUUID()}",
        displayName = "Theke",
        roles = setOf(RolePermissionMatrix.ROLE_TABLET_RECORDER)
    )
    private val memberPrincipal = UserPrincipal(
        subject = "kc-tally-member-${UUID.randomUUID()}",
        displayName = "Felix Braun",
        roles = setOf(UserRole.MEMBER)
    )

    private fun unique(name: String) = "$name ${UUID.randomUUID().toString().take(8)}"

    private fun member(principal: UserPrincipal = memberPrincipal): UserEntity {
        val user = userService.getOrCreateUser(principal)
        membershipService.addMember(user)
        return user
    }

    private fun activeEvent(vararg participants: UserEntity): EventEntity {
        val owner = userRepository.save(UserEntity(keycloakSubject = "kc-owner-${UUID.randomUUID()}", displayName = "Owner"))
        val event = eventRepository.save(EventEntity(title = unique("Stammtisch"), status = EventStatus.active, owner = owner))
        participants.forEach { eventParticipantRepository.save(EventParticipantEntity(event = event, user = it)) }
        return event
    }

    private fun drink(name: String, price: String, cost: String = "1.00"): DrinkCatalogEntity =
        drinkCatalogRepository.save(
            DrinkCatalogEntity(
                name = unique(name),
                defaultPrice = BigDecimal(price),
                costPrice = BigDecimal(cost),
                status = DrinkStatus.approved,
                active = true
            )
        )

    private fun eventDrink(event: EventEntity, drink: DrinkCatalogEntity, price: String = drink.defaultPrice.toPlainString()) =
        eventDrinkRepository.save(EventDrinkEntity(event = event, drink = drink, price = BigDecimal(price)))

    private fun assign(drink: DrinkCatalogEntity, categoryId: String) =
        drinkCatalogService.updateDrink(drink.id, UpdateDrinkRequest(tallyCategoryId = categoryId), board)

    private fun category(name: String, price: String) =
        tallyCategoryService.create(CreateTallyCategoryRequest(name = unique(name), price = BigDecimal(price)), board)

    private fun balanceOf(user: UserEntity) = ledgerService.getMemberBalance(user.id, board).creditBalance

    @Test
    fun `board manages categories and drinks fall back to none when a category is deleted`() {
        val bier = category("Bier", "3.5")
        val schnaps = category("Schnaps", "2.00")
        val helles = drink("Helles", "3.60")
        assign(helles, bier.id)

        val listed = tallyCategoryService.list(board)
        val listedBier = listed.single { it.id == bier.id }
        assertEquals(BigDecimal("3.50"), listedBier.price)
        assertEquals(listOf(helles.name), listedBier.drinks.map { it.name })
        assertTrue(listed.indexOfFirst { it.id == bier.id } < listed.indexOfFirst { it.id == schnaps.id })

        val renamed = tallyCategoryService.update(UUID.fromString(bier.id), UpdateTallyCategoryRequest(price = BigDecimal("3.80")), board)
        assertEquals(BigDecimal("3.80"), renamed.price)

        val reordered = tallyCategoryService.reorder(ReorderTallyCategoriesRequest(ids = listOf(schnaps.id, bier.id)), board)
        assertTrue(reordered.indexOfFirst { it.id == schnaps.id } < reordered.indexOfFirst { it.id == bier.id })

        val drinkDto = drinkCatalogService.getDrink(helles.id, board)
        assertEquals(bier.id, drinkDto.tallyCategoryId)
        assertEquals(BigDecimal("3.80"), drinkDto.tallyCategoryPrice)

        tallyCategoryService.delete(UUID.fromString(bier.id), board)
        assertNull(drinkCatalogService.getDrink(helles.id, board).tallyCategoryId)
        assertTrue(tallyCategoryService.list(board).none { it.id == bier.id })
        assertThrows(ResourceNotFoundException::class.java) { assign(helles, bier.id) }
    }

    @Test
    fun `only catalog maintainers manage categories and assign drinks`() {
        val bier = category("Bier", "3.50")
        val helles = drink("Helles", "3.60")
        val plain = UserPrincipal(subject = "kc-tally-plain-${UUID.randomUUID()}", roles = setOf(UserRole.MEMBER))

        assertThrows(AccessDeniedException::class.java) {
            tallyCategoryService.create(CreateTallyCategoryRequest(name = "Wein", price = BigDecimal.ONE), plain)
        }
        assertThrows(AccessDeniedException::class.java) { tallyCategoryService.delete(UUID.fromString(bier.id), plain) }
        assertThrows(AccessDeniedException::class.java) {
            drinkCatalogService.updateDrink(helles.id, UpdateDrinkRequest(tallyCategoryId = bier.id), plain)
        }
        // Lesen dürfen Mitglieder und das Thekenterminal.
        assertTrue(tallyCategoryService.list(plain).any { it.id == bier.id })
        assertTrue(tallyCategoryService.list(terminal).any { it.id == bier.id })
    }

    @Test
    fun `category names are unique and prices must not be negative`() {
        val bier = category("Bier", "3.50")
        assertThrows(InvalidRequestException::class.java) {
            tallyCategoryService.create(CreateTallyCategoryRequest(name = bier.name.uppercase(), price = BigDecimal.ONE), board)
        }
        assertThrows(InvalidRequestException::class.java) {
            tallyCategoryService.create(CreateTallyCategoryRequest(name = unique("Wein"), price = BigDecimal("-1")), board)
        }
    }

    @Test
    fun `a tally books the chosen drink at the category price and undo restores the balance`() {
        val felix = member()
        ledgerService.topup(TopupRequest(memberId = felix.id.toString(), amount = BigDecimal("20.00")), "tally-topup-${UUID.randomUUID()}", board)
        val bier = category("Bier", "3.50")
        val helles = drink("Helles", "3.60", cost = "1.10")
        val wasser = drink("Wasser", "1.50", cost = "0.30")
        assign(helles, bier.id)
        val event = activeEvent(felix)
        // Event-Preis aus einer Getränkeliste: der Kategoriepreis geht trotzdem vor.
        val hellesInEvent = eventDrink(event, helles, price = "3.20")
        val wasserInEvent = eventDrink(event, wasser, price = "1.40")

        val entry = tabletRecorderService.recordPurchase(
            event.id,
            TabletPurchaseRequest(memberId = felix.id.toString(), eventDrinkId = hellesInEvent.id.toString()),
            "tally-${UUID.randomUUID()}",
            terminal
        )
        assertEquals(BigDecimal("3.50"), entry.amount)
        assertEquals(helles.id.toString(), entry.drinkId)
        assertEquals(bier.id, entry.tallyCategoryId)
        assertEquals(bier.name, entry.tallyCategoryName)
        assertEquals(helles.name, entry.snapshot?.drinkName)
        assertEquals(BigDecimal("2.40"), entry.snapshot?.profit)
        assertEquals(BigDecimal("16.50"), balanceOf(felix))

        // Ohne Kategorie gilt der Event-Preis.
        val other = tabletRecorderService.recordPurchase(
            event.id,
            TabletPurchaseRequest(memberId = felix.id.toString(), eventDrinkId = wasserInEvent.id.toString()),
            "tally-${UUID.randomUUID()}",
            terminal
        )
        assertEquals(BigDecimal("1.40"), other.amount)
        assertNull(other.tallyCategoryId)

        val board1 = tabletRecorderService.board(event.id, terminal)
        val column = board1.columns.single { it.categoryId == bier.id }
        assertEquals(listOf(hellesInEvent.id.toString()), column.drinks.map { it.eventDrinkId })
        val row = board1.members.single { it.memberId == felix.id.toString() }
        assertEquals(1, row.counts[bier.id])
        assertEquals(1, row.otherCount)
        assertEquals(2, board1.tallyCount)
        assertEquals(BigDecimal("4.90"), board1.revenue)

        val undo = tabletRecorderService.undoPurchase(event.id, UUID.fromString(entry.id), "undo-${UUID.randomUUID()}", terminal)
        assertEquals("correction", undo.entryType)
        assertEquals(bier.id, undo.tallyCategoryId)
        assertEquals(BigDecimal("18.60"), balanceOf(felix))

        val board2 = tabletRecorderService.board(event.id, terminal)
        assertNull(board2.members.single { it.memberId == felix.id.toString() }.counts[bier.id])
        assertEquals(1, board2.tallyCount)
    }

    @Test
    fun `a barcode purchase during the event uses the category price`() {
        val principal = memberPrincipal.copy(subject = "kc-tally-scan-${UUID.randomUUID()}")
        val buyer = member(principal)
        val bier = category("Bier", "3.50")
        val helles = drink("Helles", "3.60")
        assign(helles, bier.id)
        val barcode = "40${(100000000000L..999999999999L).random()}"
        drinkBarcodeRepository.save(DrinkBarcodeEntity(drink = helles, barcode = barcode))
        val event = activeEvent(buyer)
        eventDrink(event, helles)

        val preview = ledgerService.previewBarcodePurchase(PurchasePreviewRequest(barcode = barcode), principal)
        assertEquals(BigDecimal("3.50"), preview.options.single { it.eventId == event.id.toString() }.unitPrice)

        val entry = ledgerService.purchaseByBarcode(
            PurchaseRequest(eventId = event.id.toString(), barcode = barcode),
            "scan-${UUID.randomUUID()}",
            principal
        )
        assertEquals(BigDecimal("3.50"), entry.amount)
        assertEquals(bier.id, entry.tallyCategoryId)
        assertEquals(helles.id.toString(), entry.drinkId)
        assertEquals(bier.id, ledgerEntryRepository.findById(UUID.fromString(entry.id)).orElseThrow().tallyCategory?.id.toString())
    }
}
