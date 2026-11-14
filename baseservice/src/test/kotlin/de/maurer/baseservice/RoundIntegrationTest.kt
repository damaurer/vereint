package de.maurer.baseservice

import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateRoundRequest
import de.maurer.baseservice.dto.CreateTallyCategoryRequest
import de.maurer.baseservice.dto.LedgerEntryDto
import de.maurer.baseservice.dto.TabletPurchaseRequest
import de.maurer.baseservice.dto.TopupRequest
import de.maurer.baseservice.dto.UpdateDrinkRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.InvalidRequestException
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
import de.maurer.baseservice.service.NotificationService
import de.maurer.baseservice.service.RoundService
import de.maurer.baseservice.service.TabletRecorderService
import de.maurer.baseservice.service.TallyCategoryService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.tenancy.TenantContext
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Runden am eigenen Handy (Issue #81) gegen die echten Migrationen (H2-Profil
 * `test`): Ausgeben, Striche eingeladener Personen gehen auf den Geber, bis
 * Höchstsumme oder Ablauf, älteste Runde zuerst, Rückgängig gibt Betrag und
 * Platz frei, parallele Einlösung überschreitet die Höchstsumme nicht.
 */
@SpringBootTest
@ActiveProfiles("test")
class RoundIntegrationTest @Autowired constructor(
    private val roundService: RoundService,
    private val tabletRecorderService: TabletRecorderService,
    private val ledgerService: LedgerService,
    private val notificationService: NotificationService,
    private val tallyCategoryService: TallyCategoryService,
    private val drinkCatalogService: DrinkCatalogService,
    private val userService: UserService,
    private val membershipService: MembershipService,
    private val userRepository: UserRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val eventDrinkRepository: EventDrinkRepository,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val entityManager: EntityManager,
    transactionManager: PlatformTransactionManager
) {

    private val transactionTemplate = TransactionTemplate(transactionManager)

    private val board = UserPrincipal(
        subject = "kc-round-board-${UUID.randomUUID()}",
        displayName = "Vorstand",
        roles = setOf(UserRole.BOARD, UserRole.MEMBER)
    )
    private val terminal = UserPrincipal(
        subject = "kc-round-terminal-${UUID.randomUUID()}",
        displayName = "Theke",
        roles = setOf(RolePermissionMatrix.ROLE_TABLET_RECORDER)
    )

    private fun unique(name: String) = "$name ${UUID.randomUUID().toString().take(8)}"

    private fun person(name: String): Pair<UserPrincipal, UserEntity> {
        val principal = UserPrincipal(subject = "kc-round-${UUID.randomUUID()}", displayName = name, roles = setOf(UserRole.MEMBER))
        val user = userService.getOrCreateUser(principal)
        membershipService.addMember(user)
        return principal to user
    }

    private fun activeEvent(vararg participants: UserEntity): EventEntity {
        val owner = userRepository.save(UserEntity(keycloakSubject = "kc-owner-${UUID.randomUUID()}", displayName = "Owner"))
        val event = eventRepository.save(EventEntity(title = unique("Stammtisch"), status = EventStatus.active, owner = owner))
        participants.forEach {
            eventParticipantRepository.save(EventParticipantEntity(event = event, user = it, rsvp = RsvpStatus.accepted))
        }
        return event
    }

    private fun drink(name: String, price: String): DrinkCatalogEntity =
        drinkCatalogRepository.save(
            DrinkCatalogEntity(
                name = unique(name),
                defaultPrice = BigDecimal(price),
                costPrice = BigDecimal("1.00"),
                status = DrinkStatus.approved,
                active = true
            )
        )

    private fun eventDrink(event: EventEntity, drink: DrinkCatalogEntity) =
        eventDrinkRepository.save(EventDrinkEntity(event = event, drink = drink, price = drink.defaultPrice))

    private fun topup(user: UserEntity, amount: String) =
        ledgerService.topup(TopupRequest(memberId = user.id.toString(), amount = BigDecimal(amount)), "round-topup-${UUID.randomUUID()}", board)

    private fun balanceOf(user: UserEntity) = ledgerService.getMemberBalance(user.id, board).creditBalance

    private fun tally(event: EventEntity, user: UserEntity, eventDrink: EventDrinkEntity, key: String = "round-tally-${UUID.randomUUID()}"): LedgerEntryDto =
        tabletRecorderService.recordPurchase(
            event.id,
            TabletPurchaseRequest(memberId = user.id.toString(), eventDrinkId = eventDrink.id.toString()),
            key,
            terminal
        )

    private fun request(kind: String, invitees: List<UserEntity>, eventDrink: EventDrinkEntity? = null, validity: String = "1h", max: String? = null) =
        CreateRoundRequest(
            kind = kind,
            eventDrinkId = eventDrink?.id?.toString(),
            validity = validity,
            memberIds = invitees.map { it.id.toString() },
            maxAmount = max?.let { BigDecimal(it) }
        )

    @Test
    fun `a round pays one drink per invitee from the sponsor and the terminal shows who pays`() {
        val (thomasP, thomas) = person("Thomas")
        val (felixP, felix) = person("Felix")
        val (_, mia) = person("Mia")
        topup(thomas, "5.00")
        topup(felix, "10.00")
        val event = activeEvent(thomas, felix, mia)
        val helles = eventDrink(event, drink("Helles", "3.50"))

        val round = roundService.create(event.id, request("round", listOf(felix, mia), helles), thomasP)
        assertEquals(BigDecimal("7.00"), round.maxAmount)
        assertEquals("running", round.status)
        assertEquals(thomas.displayName, round.sponsorName)

        // Push an die Eingeladenen, nicht an den Geber.
        assertTrue(notificationService.listOwnNotifications(felixP).any { it.type == "round" && it.title.contains(thomas.displayName) })
        assertTrue(notificationService.listOwnNotifications(thomasP).none { it.type == "round" })

        val boardBefore = tabletRecorderService.board(event.id, terminal)
        assertEquals(round.id, boardBefore.members.single { it.memberId == felix.id.toString() }.fundedBy?.roundId)
        assertNull(boardBefore.members.single { it.memberId == thomas.id.toString() }.fundedBy)
        assertEquals(listOf(round.id), boardBefore.rounds.map { it.id })

        val first = tally(event, felix, helles)
        assertEquals("round", first.source)
        assertEquals(thomas.id.toString(), first.memberId)
        assertEquals(felix.id.toString(), first.beneficiaryId)
        assertEquals(round.id, first.roundId)
        assertEquals(BigDecimal("1.50"), balanceOf(thomas))
        assertEquals(BigDecimal("10.00"), balanceOf(felix))

        // Eine Runde = ein Getränk je Person; das zweite geht auf die eigene Rechnung.
        val second = tally(event, felix, helles)
        assertEquals("tabletManual", second.source)
        assertEquals(felix.id.toString(), second.memberId)
        assertEquals(BigDecimal("6.50"), balanceOf(felix))

        // Das Guthaben des Gebers darf ins Minus gehen.
        tally(event, mia, helles)
        assertEquals(BigDecimal("-2.00"), balanceOf(thomas))

        val boardAfter = tabletRecorderService.board(event.id, terminal)
        assertEquals(2, boardAfter.members.single { it.memberId == felix.id.toString() }.otherCount)
        assertEquals(0, boardAfter.members.single { it.memberId == thomas.id.toString() }.otherCount)
        assertNull(boardAfter.members.single { it.memberId == felix.id.toString() }.fundedBy)
        assertTrue(boardAfter.rounds.isEmpty(), "aufgebrauchte Runden laufen nicht mehr")
        val listed = roundService.list(event.id, thomasP).single()
        assertEquals("usedUp", listed.status)
        assertEquals(BigDecimal("7.00"), listed.usedAmount)
        assertTrue(listed.invitees.all { it.redeemed })
    }

    @Test
    fun `an evening pays everything up to the maximum and undo frees amount and place`() {
        val (sabineP, sabine) = person("Sabine")
        val (_, felix) = person("Felix")
        val event = activeEvent(sabine, felix)
        val helles = eventDrink(event, drink("Helles", "3.00"))
        val wasser = eventDrink(event, drink("Wasser", "1.50"))
        roundService.create(event.id, request("evening", listOf(felix), validity = "eventEnd", max = "6.00"), sabineP)

        val a = tally(event, felix, helles)
        val b = tally(event, felix, wasser)
        assertEquals("evening", a.source)
        assertEquals("evening", b.source)
        // 4,50 verbraucht, ein Helles (3,00) passt nicht mehr: eigene Rechnung.
        val c = tally(event, felix, helles)
        assertEquals("tabletManual", c.source)
        assertEquals(BigDecimal("-4.50"), balanceOf(sabine))

        val undo = tabletRecorderService.undoPurchase(event.id, UUID.fromString(a.id), "round-undo-${UUID.randomUUID()}", terminal)
        assertEquals(sabine.id.toString(), undo.memberId)
        assertEquals(a.roundId, undo.roundId)
        assertEquals(BigDecimal("-1.50"), balanceOf(sabine))

        // Der Betrag ist wieder frei: das nächste Helles geht wieder auf den Abend.
        assertEquals("evening", tally(event, felix, helles).source)
        assertEquals(BigDecimal("4.50"), roundService.list(event.id, sabineP).single().usedAmount)
    }

    @Test
    fun `undo of a round tally frees the place of the invitee`() {
        val (thomasP, thomas) = person("Thomas")
        val (_, felix) = person("Felix")
        val event = activeEvent(thomas, felix)
        val helles = eventDrink(event, drink("Helles", "3.50"))
        roundService.create(event.id, request("round", listOf(felix), helles), thomasP)

        val first = tally(event, felix, helles)
        tabletRecorderService.undoPurchase(event.id, UUID.fromString(first.id), "round-undo-${UUID.randomUUID()}", terminal)
        assertEquals(BigDecimal("0.00"), balanceOf(thomas))
        assertEquals(thomas.id.toString(), tally(event, felix, helles).memberId)
    }

    @Test
    fun `a repeated tally with the same key is not booked twice`() {
        val (thomasP, thomas) = person("Thomas")
        val (_, felix) = person("Felix")
        val event = activeEvent(thomas, felix)
        val helles = eventDrink(event, drink("Helles", "3.50"))
        roundService.create(event.id, request("round", listOf(felix), helles), thomasP)

        val key = "round-replay-${UUID.randomUUID()}"
        val first = tally(event, felix, helles, key)
        val again = tally(event, felix, helles, key)
        assertEquals(first.id, again.id)
        assertEquals(BigDecimal("-3.50"), balanceOf(thomas))
    }

    @Test
    fun `the oldest running round goes first and expired or ended rounds do not apply`() {
        val (thomasP, thomas) = person("Thomas")
        val (sabineP, sabine) = person("Sabine")
        val (_, felix) = person("Felix")
        val event = activeEvent(thomas, sabine, felix)
        val helles = eventDrink(event, drink("Helles", "3.50"))
        val older = roundService.create(event.id, request("round", listOf(felix), helles, validity = "30m"), thomasP)
        val newer = roundService.create(event.id, request("evening", listOf(felix), max = "20.00", validity = "eventEnd"), sabineP)

        val claim = { now: Instant ->
            transactionTemplate.execute {
                roundService.claimFor(
                    eventRepository.findById(event.id).orElseThrow(),
                    userRepository.findById(felix.id).orElseThrow(),
                    eventDrinkRepository.findById(helles.id).orElseThrow(),
                    now
                )?.id?.toString()
            }
        }
        assertEquals(older.id, claim(Instant.now()))
        // Nach 31 Minuten ist die erste Runde abgelaufen; es greift der Abend.
        val later = Instant.now().plus(Duration.ofMinutes(31))
        assertEquals(newer.id, claim(later))
        assertEquals("expired", roundService.list(event.id, thomasP, later).first { it.id == older.id }.status)

        // Vorzeitig beendet: greift nicht mehr; beenden darf nur der Geber.
        assertThrows(AccessDeniedException::class.java) {
            roundService.end(event.id, UUID.fromString(newer.id), thomasP)
        }
        assertEquals("ended", roundService.end(event.id, UUID.fromString(newer.id), sabineP).status)
        assertNull(claim(later))
    }

    @Test
    fun `a round on one drink also covers drinks of the same tally category`() {
        val (thomasP, thomas) = person("Thomas")
        val (_, felix) = person("Felix")
        val event = activeEvent(thomas, felix)
        val bier = tallyCategoryService.create(CreateTallyCategoryRequest(name = unique("Bier"), price = BigDecimal("3.00")), board)
        val hellesDrink = drink("Helles", "3.50")
        val pilsDrink = drink("Pils", "3.80")
        listOf(hellesDrink, pilsDrink).forEach {
            drinkCatalogService.updateDrink(it.id, UpdateDrinkRequest(tallyCategoryId = bier.id), board)
        }
        val helles = eventDrink(event, hellesDrink)
        val pils = eventDrink(event, pilsDrink)
        val wasser = eventDrink(event, drink("Wasser", "1.50"))
        val round = roundService.create(event.id, request("round", listOf(felix), helles), thomasP)
        assertEquals(BigDecimal("3.00"), round.maxAmount)

        assertEquals("tabletManual", tally(event, felix, wasser).source)
        val entry = tally(event, felix, pils)
        assertEquals("round", entry.source)
        assertEquals(bier.id, entry.tallyCategoryId)
        assertEquals(BigDecimal("-3.00"), balanceOf(thomas))
    }

    @Test
    fun `only people of a running event can buy a round for people of the event`() {
        val (thomasP, thomas) = person("Thomas")
        val (strangerP, _) = person("Fremd")
        val (_, outsider) = person("Draussen")
        val (_, felix) = person("Felix")
        val event = activeEvent(thomas, felix)
        eventDrink(event, drink("Helles", "3.50"))

        assertThrows(AccessDeniedException::class.java) {
            roundService.create(event.id, request("round", listOf(felix)), strangerP)
        }
        assertThrows(InvalidRequestException::class.java) {
            roundService.create(event.id, request("round", listOf(outsider)), thomasP)
        }
        assertThrows(InvalidRequestException::class.java) {
            roundService.create(event.id, request("round", emptyList()), thomasP)
        }
        assertThrows(InvalidRequestException::class.java) {
            roundService.create(event.id, request("evening", listOf(felix)), thomasP)
        }
        assertThrows(InvalidRequestException::class.java) {
            roundService.create(event.id, request("round", listOf(felix), validity = "2d"), thomasP)
        }

        val options = roundService.options(event.id, thomasP)
        assertTrue(options.members.none { it.memberId == thomas.id.toString() })
        assertTrue(options.members.single { it.memberId == felix.id.toString() }.accepted)

        val closed = eventRepository.findById(event.id).orElseThrow()
        closed.status = EventStatus.completed
        eventRepository.save(closed)
        assertThrows(EventNotActiveException::class.java) {
            roundService.create(event.id, request("round", listOf(felix)), thomasP)
        }
    }

    @Test
    fun `parallel tallies cannot exceed the maximum of an evening`() {
        val (sabineP, sabine) = person("Sabine")
        val (_, felix) = person("Felix")
        val (_, mia) = person("Mia")
        val event = activeEvent(sabine, felix, mia)
        val helles = eventDrink(event, drink("Helles", "3.00"))
        roundService.create(event.id, request("evening", listOf(felix, mia), max = "3.00"), sabineP)

        val stammtischId = TenantContext.requireStammtischId()
        val firstBooked = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val first = pool.submit<LedgerEntryDto> {
                TenantContext.runIn(stammtischId) {
                    transactionTemplate.execute {
                        val entry = tally(event, felix, helles)
                        entityManager.flush()
                        firstBooked.countDown()
                        // Runde gesperrt halten, während der zweite Strich kommt.
                        Thread.sleep(500)
                        entry
                    }!!
                }
            }
            assertTrue(firstBooked.await(10, TimeUnit.SECONDS))
            val second = pool.submit<LedgerEntryDto> {
                TenantContext.runIn(stammtischId) { tally(event, mia, helles) }
            }
            val sources = listOf(first.get(10, TimeUnit.SECONDS).source, second.get(10, TimeUnit.SECONDS).source)
            assertEquals(listOf("evening", "tabletManual"), sources)
        } finally {
            pool.shutdownNow()
        }
        assertEquals(BigDecimal("-3.00"), balanceOf(sabine))
    }
}
