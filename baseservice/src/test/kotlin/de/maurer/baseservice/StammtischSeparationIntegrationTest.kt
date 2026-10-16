package de.maurer.baseservice

import de.maurer.baseservice.domain.StammtischEntity
import de.maurer.baseservice.dto.CreateEventRequest
import de.maurer.baseservice.dto.CreateMemberInviteRequest
import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.dto.ProposeDrinkRequest
import de.maurer.baseservice.dto.SaveStammtischRoleRequest
import de.maurer.baseservice.dto.TopupRequest
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.LastAdminProtectedException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.DrinkCatalogService
import de.maurer.baseservice.service.DrinkLibraryService
import de.maurer.baseservice.service.EventService
import de.maurer.baseservice.service.LedgerService
import de.maurer.baseservice.service.MemberInviteService
import de.maurer.baseservice.service.PlatformService
import de.maurer.baseservice.service.StammtischService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.support.DefaultStammtischExtension.Companion.DEFAULT_STAMMTISCH_ID
import de.maurer.baseservice.tenancy.StammtischMemberships
import de.maurer.baseservice.tenancy.StammtischSeeder
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.math.BigDecimal
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Strikte Trennung der Stammtische (H2, Hibernate `@TenantId`). Stammtisch A
 * ist der Standard-Stammtisch der Migration, B wird je Test neu angelegt.
 * Die Prüfung auf Datenbankebene (Row Level Security) liegt in
 * [RowLevelSecurityIntegrationTest].
 */
@SpringBootTest
@ActiveProfiles("test")
class StammtischSeparationIntegrationTest @Autowired constructor(
    private val context: WebApplicationContext,
    private val platformService: PlatformService,
    private val stammtischService: StammtischService,
    private val userService: UserService,
    private val eventService: EventService,
    private val ledgerService: LedgerService,
    private val drinkCatalogService: DrinkCatalogService,
    private val drinkLibraryService: DrinkLibraryService,
    private val memberInviteService: MemberInviteService,
    private val eventRepository: EventRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val stammtischRepository: StammtischRepository,
    private val stammtischMemberships: StammtischMemberships,
    private val stammtischSeeder: StammtischSeeder,
    private val tenantTransactions: TenantTransactions
) {

    private lateinit var mockMvc: MockMvc

    /** Plattform-Admin; wird beim Anlegen Admin von B (und per Test-Login Mitglied von A). */
    private lateinit var platform: UserPrincipal

    /** Vorstand im Standard-Stammtisch A, kein Mitglied von B. */
    private lateinit var boardA: UserPrincipal

    private lateinit var stammtischB: UUID

    @BeforeEach
    fun setup() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
            .apply<DefaultMockMvcBuilder>(springSecurity())
            .build()
        platform = UserPrincipal(
            subject = "kc-platform-${UUID.randomUUID()}",
            displayName = "Plattform",
            roles = setOf(UserRole.ADMIN),
            platformAdmin = true
        )
        boardA = UserPrincipal(subject = "kc-board-a-${UUID.randomUUID()}", displayName = "Vorstand A", roles = setOf(UserRole.BOARD))
        stammtischB = UUID.fromString(platformService.create(CreateStammtischRequest(name = "Stammtisch B"), platform).id)
    }

    /** Principal wie nach dem Filter: Rollen des Stammtischs statt Token-Rollen. */
    private fun inB(principal: UserPrincipal, vararg roles: String) =
        principal.copy(roles = roles.toSet(), stammtischId = stammtischB.toString())

    private fun <T> asB(block: () -> T): T = TenantContext.runIn(stammtischB, block)

    private fun newEvent(principal: UserPrincipal, title: String) = eventService.createEvent(
        CreateEventRequest(title = title, startsAt = Instant.now().plus(1, ChronoUnit.DAYS)),
        principal
    )

    @Test
    fun `a new Stammtisch starts with its own roles and its creator as admin`() {
        val adminB = inB(platform, UserRole.ADMIN, UserRole.MEMBER)
        val roles = asB { stammtischService.roles(adminB) }

        assertEquals(setOf("member", "board", "admin", "tabletRecorder"), roles.roles.map { it.code }.toSet())
        assertEquals(1, roles.roles.single { it.code == UserRole.ADMIN }.memberCount)
        assertEquals("Stammtisch B", asB { stammtischService.current(adminB) }.name)
    }

    @Test
    fun `events, drinks and balances of one Stammtisch are invisible in another`() {
        val eventA = newEvent(boardA, "Nur in A")
        val drinkA = drinkCatalogService.proposeDrink(
            ProposeDrinkRequest(name = "Helles A", defaultPrice = BigDecimal("3.00"), barcodes = listOf("4000000000017")),
            boardA
        )
        val memberA = userService.getOrCreateUser(UserPrincipal(subject = "kc-a-${UUID.randomUUID()}", roles = setOf(UserRole.MEMBER)))
        ledgerService.topup(TopupRequest(memberId = memberA.id.toString(), amount = BigDecimal("10.00")), UUID.randomUUID().toString(), boardA)

        val adminB = inB(platform, UserRole.ADMIN, UserRole.MEMBER)
        asB {
            assertTrue(eventService.listEvents(adminB).none { it.id == eventA.id })
            assertTrue(eventRepository.findById(UUID.fromString(eventA.id)).isEmpty)
            assertTrue(drinkCatalogRepository.findById(UUID.fromString(drinkA.id)).isEmpty)
            assertTrue(drinkCatalogService.listDrinks(adminB, null).none { it.id == drinkA.id })
            assertTrue(ledgerService.listBalances(adminB).none { it.memberId == memberA.id.toString() })
        }
        // Gleicher Barcode in B ist erlaubt: Barcodes sind je Stammtisch eindeutig.
        asB {
            drinkCatalogService.proposeDrink(
                ProposeDrinkRequest(name = "Helles B", defaultPrice = BigDecimal("2.50"), barcodes = listOf("4000000000017")),
                adminB
            )
        }
        assertEquals(BigDecimal("3.00"), drinkCatalogRepository.findById(UUID.fromString(drinkA.id)).orElseThrow().defaultPrice.setScale(2))
    }

    @Test
    fun `people of another Stammtisch cannot be looked up, booked or invited`() {
        val memberA = userService.getOrCreateUser(UserPrincipal(subject = "kc-a-${UUID.randomUUID()}", roles = setOf(UserRole.MEMBER)))
        val adminB = inB(platform, UserRole.ADMIN, UserRole.MEMBER)

        asB {
            assertThrows(ResourceNotFoundException::class.java) { userService.getUserById(memberA.id, adminB) }
            assertThrows(ResourceNotFoundException::class.java) {
                ledgerService.topup(TopupRequest(memberId = memberA.id.toString(), amount = BigDecimal("5.00")), UUID.randomUUID().toString(), adminB)
            }
            assertTrue(userService.directory(adminB).none { it.id == memberA.id.toString() })
            assertTrue(userService.listUsers(null, null, null, null, adminB).content.none { it.id == memberA.id.toString() })
        }
    }

    @Test
    fun `a member of A gets no access to B over HTTP`() {
        val subject = "kc-http-${UUID.randomUUID()}"

        mockMvc.perform(
            get("/api/v1/events")
                .header("X-Stammtisch-Id", stammtischB.toString())
                .with(jwt().jwt { it.subject(subject).claim("realm_access", mapOf("roles" to listOf("member"))) })
        )
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.code").value(ErrorCode.STAMMTISCH_ACCESS_DENIED))
    }

    @Test
    fun `with several memberships a Stammtisch must be chosen and only its data is returned`() {
        newEvent(boardA, "Event in A")
        val adminB = inB(platform, UserRole.ADMIN, UserRole.MEMBER)
        val eventB = asB { newEvent(adminB, "Event in B") }
        val token = jwt().jwt { it.subject(platform.subject).claim("realm_access", mapOf("roles" to listOf("admin"))) }

        mockMvc.perform(get("/api/v1/events").with(token))
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.code").value(ErrorCode.STAMMTISCH_REQUIRED))

        mockMvc.perform(get("/api/v1/events").header("X-Stammtisch-Id", stammtischB.toString()).with(token))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].id").value(eventB.id))

        mockMvc.perform(get("/api/v1/stammtische").with(token))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[?(@.id == '$stammtischB')].name").value("Stammtisch B"))
    }

    @Test
    fun `roles are defined per Stammtisch and the last manager cannot leave`() {
        val adminB = inB(platform, UserRole.ADMIN, UserRole.MEMBER)
        val role = asB {
            stammtischService.createRole(
                SaveStammtischRoleRequest(name = "Kassenprüfung", permissions = setOf(Permission.LEDGER_READ)),
                adminB
            )
        }
        assertEquals("kassenpruefung", role.code)
        assertTrue(stammtischService.roles(boardA.copy(roles = setOf(UserRole.ADMIN))).roles.none { it.code == role.code })

        val ex = asB { assertThrows(LastAdminProtectedException::class.java) { stammtischService.leave(adminB) } }
        assertEquals(ErrorCode.LAST_ROLE_MANAGER_PROTECTED, ex.errorCode)

        // Den Admin-Rollen alle Verwaltungsrechte zu nehmen wäre dasselbe.
        val adminRoleId = asB { stammtischService.roles(adminB).roles.single { it.code == UserRole.ADMIN }.id }
        asB {
            assertThrows(LastAdminProtectedException::class.java) {
                stammtischService.updateRole(
                    UUID.fromString(adminRoleId),
                    SaveStammtischRoleRequest(name = "Admin", permissions = setOf(Permission.PROFILE_READ_SELF)),
                    adminB
                )
            }
        }
    }

    @Test
    fun `an invite link of B lets a member of A join B without seeing A in B`() {
        val adminB = inB(platform, UserRole.ADMIN, UserRole.MEMBER)
        val token = asB { memberInviteService.createInvite(CreateMemberInviteRequest(), adminB).token }
        val memberA = UserPrincipal(subject = "kc-joiner-${UUID.randomUUID()}", displayName = "Wechsler", roles = setOf(UserRole.MEMBER))
        val user = userService.getOrCreateUser(memberA)

        val joined = TenantContext.runWithoutTenant { memberInviteService.join(token, memberA) }

        assertEquals(stammtischB.toString(), joined.stammtischId)
        assertFalse(joined.alreadyMember)
        val ids = stammtischService.myStammtische(memberA).map { it.id }.toSet()
        assertEquals(setOf(DEFAULT_STAMMTISCH_ID.toString(), stammtischB.toString()), ids)
        asB { assertEquals(setOf(UserRole.MEMBER), stammtischService.myStammtische(memberA).single { it.id == stammtischB.toString() }.roles) }
        assertNotEquals(null, asB { userService.getUserById(user.id, adminB) })
    }

    @Test
    fun `drinks travel between Stammtische only through the shared library, without prices`() {
        val drinkA = drinkCatalogService.proposeDrink(
            ProposeDrinkRequest(
                name = "Spezi ${UUID.randomUUID()}",
                category = "Limo",
                defaultPrice = BigDecimal("2.20"),
                barcodes = listOf("4${(100000000000L..999999999999L).random()}")
            ),
            boardA
        )
        val entry = drinkLibraryService.shareFromCatalog(UUID.fromString(drinkA.id), boardA)
        assertEquals(drinkA.id, entry.catalogDrinkId)

        val adminB = inB(platform, UserRole.ADMIN, UserRole.MEMBER)
        val seenInB = asB { drinkLibraryService.search(adminB, null, entry.barcodes.single()).single() }
        assertNull(seenInB.catalogDrinkId)

        val adopted = asB {
            drinkCatalogService.proposeDrink(
                ProposeDrinkRequest(
                    name = seenInB.name,
                    category = seenInB.category,
                    defaultPrice = BigDecimal("1.80"),
                    barcodes = seenInB.barcodes,
                    libraryDrinkId = seenInB.id
                ),
                adminB
            )
        }
        assertEquals(entry.id, adopted.libraryDrinkId)
        assertEquals(adopted.id, asB { drinkLibraryService.get(UUID.fromString(entry.id), adminB).catalogDrinkId })
        assertEquals(BigDecimal("2.20"), drinkCatalogRepository.findById(UUID.fromString(drinkA.id)).orElseThrow().defaultPrice.setScale(2))
    }

    @Test
    fun `only platform admins create Stammtische`() {
        val ex = assertThrows(ApiException::class.java) {
            platformService.create(CreateStammtischRequest(name = "Nicht erlaubt"), boardA)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `the first platform admin takes over a never used Stammtisch, nobody takes over a used one`() {
        val empty = tenantTransactions.asSystem { stammtischRepository.saveAndFlush(StammtischEntity(name = "Frisch installiert")) }
        tenantTransactions.inStammtisch(empty.id) { stammtischSeeder.seed() }
        val first = TenantContext.runWithoutTenant { userService.getOrCreateUser(platform) }

        assertTrue(platformService.claimUnclaimedStammtisch(first, empty.id))
        val membership = stammtischMemberships.memberships(first.id).single { it.stammtischId == empty.id }
        assertTrue(UserRole.ADMIN in membership.roles)

        val second = TenantContext.runWithoutTenant {
            userService.getOrCreateUser(platform.copy(subject = "kc-platform-2-${UUID.randomUUID()}"))
        }
        assertFalse(platformService.claimUnclaimedStammtisch(second, empty.id))
        assertTrue(stammtischMemberships.memberships(second.id).none { it.stammtischId == empty.id })
    }
}
