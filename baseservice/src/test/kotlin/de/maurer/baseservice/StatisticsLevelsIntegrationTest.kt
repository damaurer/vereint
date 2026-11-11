package de.maurer.baseservice

import de.maurer.baseservice.domain.AccountingMode
import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.domain.PurchaseSource
import de.maurer.baseservice.domain.StatisticFeature
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AcceptTermsRequest
import de.maurer.baseservice.dto.CorrectionRequest
import de.maurer.baseservice.dto.CreateEventRequest
import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.dto.RsvpRequest
import de.maurer.baseservice.dto.TopupRequest
import de.maurer.baseservice.dto.UpdateEventRequest
import de.maurer.baseservice.dto.UpdateStatisticsSettingsRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.PermissionDeniedException
import de.maurer.baseservice.repository.AuditLogRepository
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.StatisticRecordRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.AuditService
import de.maurer.baseservice.service.EventService
import de.maurer.baseservice.service.LedgerService
import de.maurer.baseservice.service.MembershipService
import de.maurer.baseservice.service.PlatformService
import de.maurer.baseservice.service.StammtischExportService
import de.maurer.baseservice.service.StatisticsLevelService
import de.maurer.baseservice.service.StatisticsRecorder
import de.maurer.baseservice.service.StatisticsService
import de.maurer.baseservice.service.StatisticsSettingsService
import de.maurer.baseservice.service.TermsService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.tenancy.TenantContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Erfassung mit Schaltern, Löschen und die Statistik-Ebenen mit zwei Gruppen
 * (H2 mit den echten Migrationen; die Trennung prüft hier Hibernate, die
 * Row-Level-Security der [RowLevelSecurityIntegrationTest]).
 */
@SpringBootTest
@ActiveProfiles("test")
class StatisticsLevelsIntegrationTest @Autowired constructor(
    private val platformService: PlatformService,
    private val userService: UserService,
    private val membershipService: MembershipService,
    private val termsService: TermsService,
    private val eventService: EventService,
    private val ledgerService: LedgerService,
    private val levels: StatisticsLevelService,
    private val settings: StatisticsSettingsService,
    private val statisticsService: StatisticsService,
    private val recorder: StatisticsRecorder,
    private val exportService: StammtischExportService,
    private val recordRepository: StatisticRecordRepository,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val auditLogRepository: AuditLogRepository
) {

    private lateinit var groupA: UUID
    private lateinit var groupB: UUID
    private lateinit var annaUser: UserEntity
    private lateinit var benUser: UserEntity
    private lateinit var adminUser: UserEntity
    private val suffix = UUID.randomUUID().toString().take(8)

    private val annaSubject = "kc-levels-anna-$suffix"
    private val benSubject = "kc-levels-ben-$suffix"
    private val adminSubject = "kc-levels-admin-$suffix"

    private fun principal(subject: String, name: String, group: UUID?, role: String) =
        UserPrincipal(subject = subject, displayName = name, roles = setOf(role), stammtischId = group?.toString())

    private fun anna(group: UUID = groupA) = principal(annaSubject, "Anna $suffix", group, if (group == groupB) UserRole.ADMIN else UserRole.MEMBER)
    private fun ben() = principal(benSubject, "Ben $suffix", groupA, UserRole.MEMBER)
    private fun admin() = principal(adminSubject, "Admin $suffix", groupA, UserRole.ADMIN)
    private fun annaAnywhere() = principal(annaSubject, "Anna $suffix", null, UserRole.MEMBER)

    private fun <T> inA(block: () -> T): T = TenantContext.runIn(groupA, block)
    private fun <T> inB(block: () -> T): T = TenantContext.runIn(groupB, block)

    private fun join(group: UUID, principal: UserPrincipal, role: String): UserEntity = TenantContext.runIn(group) {
        val user = userService.getOrCreateUser(principal)
        membershipService.addMember(user, setOf(role))
        termsService.accept(principal, AcceptTermsRequest(acceptTerms = true))
        user
    }

    private fun records(group: UUID, feature: String): Int = TenantContext.runIn(group) {
        recordRepository.findAll().count { it.feature == feature }
    }

    private fun event(
        title: String,
        invite: List<UserEntity>,
        statistics: Boolean = true,
        owner: UserPrincipal = admin(),
        group: UUID = groupA
    ): UUID = TenantContext.runIn(group) {
        UUID.fromString(
            eventService.createEvent(
                CreateEventRequest(
                    title = "$title $suffix",
                    startsAt = Instant.now().minus(Duration.ofDays(2)),
                    status = "published",
                    inviteUserIds = invite.map { it.id.toString() },
                    statisticsEnabled = statistics
                ),
                owner
            ).id
        )
    }

    @BeforeEach
    fun setup() {
        val platform = UserPrincipal(
            subject = "kc-levels-platform-${UUID.randomUUID()}", displayName = "Plattform",
            roles = setOf(UserRole.ADMIN), platformAdmin = true
        )
        groupA = UUID.fromString(platformService.create(CreateStammtischRequest(name = "Ebenen A $suffix"), platform).id)
        groupB = UUID.fromString(platformService.create(CreateStammtischRequest(name = "Ebenen B $suffix"), platform).id)
        adminUser = join(groupA, admin(), UserRole.ADMIN)
        annaUser = join(groupA, anna(), UserRole.MEMBER)
        benUser = join(groupA, ben(), UserRole.MEMBER)
        join(groupB, anna(groupB), UserRole.ADMIN)
    }

    @Test
    fun `answers are recorded only when user, group and event allow it`() {
        val open = event("Offen", listOf(annaUser, benUser))
        val closed = event("Ohne Statistik", listOf(annaUser), statistics = false)
        val later = event("Später", listOf(annaUser))
        val last = event("Zuletzt", listOf(annaUser))
        // Events mit eingeschalteter Statistik zählen beim Anlegen, das ausgeschaltete nicht.
        assertEquals(3, records(groupA, StatisticFeature.EVENT))

        inA { eventService.respond(open, RsvpRequest("accepted"), anna()) }
        inA { eventService.respond(closed, RsvpRequest("accepted"), anna()) }
        assertEquals(1, records(groupA, StatisticFeature.RSVP), "Event ausgeschaltet: nichts erfasst")

        inA { settings.updateGroupSettings(UpdateStatisticsSettingsRequest(false), admin()) }
        inA { eventService.respond(later, RsvpRequest("maybe"), anna()) }
        assertEquals(1, records(groupA, StatisticFeature.RSVP), "Gruppe ausgeschaltet: nichts erfasst")
        assertTrue(inA { auditLogRepository.findAll().any { it.action == AuditService.ACTION_STATISTICS_SWITCHED } })
        inA { settings.updateGroupSettings(UpdateStatisticsSettingsRequest(true), admin()) }

        // Gruppe an, Event an, aber Nutzer aus: der Nutzer gewinnt.
        TenantContext.runWithoutTenant { settings.updateMySettings(UpdateStatisticsSettingsRequest(false), annaAnywhere()) }
        inA { eventService.respond(last, RsvpRequest("declined"), anna()) }
        assertEquals(1, records(groupA, StatisticFeature.RSVP), "Nutzer ausgeschaltet: nichts erfasst")
        val bEvent = event("In B", emptyList(), owner = anna(groupB), group = groupB)
        assertEquals(0, records(groupB, StatisticFeature.EVENT), "auch in keiner anderen Gruppe")
        assertNotNull(bEvent)

        // Ausschalten löscht nichts; wieder an zählt sofort.
        TenantContext.runWithoutTenant { settings.updateMySettings(UpdateStatisticsSettingsRequest(true), annaAnywhere()) }
        inA { eventService.respond(last, RsvpRequest("accepted"), anna()) }
        assertEquals(2, records(groupA, StatisticFeature.RSVP))

        // Event wieder einschalten: ab jetzt zählt es.
        inA { eventService.updateEvent(closed, UpdateEventRequest(statisticsEnabled = true), admin()) }
        inA { eventService.respond(closed, RsvpRequest("declined"), anna()) }
        assertEquals(3, records(groupA, StatisticFeature.RSVP))
    }

    @Test
    fun `a reversed booking removes its statistic record`() {
        val entry = inA {
            ledgerService.topup(TopupRequest(memberId = annaUser.id.toString(), amount = BigDecimal("10.00")), "levels-topup-$suffix", admin())
        }
        assertEquals(1, records(groupA, StatisticFeature.TOP_UP))

        val drink = inA {
            drinkCatalogRepository.saveAndFlush(
                DrinkCatalogEntity(name = "Helles $suffix", category = "Bier", defaultPrice = BigDecimal("2.50"), status = DrinkStatus.approved, active = true)
            )
        }
        val purchase = inA {
            val saved = ledgerEntryRepository.saveAndFlush(
                LedgerEntryEntity(
                    entryType = LedgerEntryType.purchase, member = annaUser, drink = drink, amount = BigDecimal("2.50"),
                    accountingMode = AccountingMode.credit, source = PurchaseSource.pwaBarcode, actor = annaUser,
                    idempotencyKey = "levels-buy-$suffix"
                )
            )
            recorder.ledgerEntry(saved)
            saved
        }
        assertEquals(1, records(groupA, StatisticFeature.PURCHASE))
        assertEquals(1, inA { statisticsService.clubStatistics(anna()) }.totalItems)

        inA { ledgerService.correct(CorrectionRequest(originalEntryId = purchase.id.toString(), reason = "Test"), "levels-c1-$suffix", admin()) }
        inA { ledgerService.correct(CorrectionRequest(originalEntryId = entry.id, reason = "Test"), "levels-c2-$suffix", admin()) }
        assertEquals(0, records(groupA, StatisticFeature.PURCHASE))
        assertEquals(0, records(groupA, StatisticFeature.TOP_UP))
    }

    @Test
    fun `the group statistic only counts recorded purchases but revenue stays complete`() {
        val drink = inA {
            drinkCatalogRepository.saveAndFlush(
                DrinkCatalogEntity(name = "Pils $suffix", category = "Bier", defaultPrice = BigDecimal("3.00"), status = DrinkStatus.approved, active = true)
            )
        }
        fun buy(key: String, record: Boolean) = inA {
            val saved = ledgerEntryRepository.saveAndFlush(
                LedgerEntryEntity(
                    entryType = LedgerEntryType.purchase, member = benUser, drink = drink, amount = BigDecimal("3.00"),
                    accountingMode = AccountingMode.credit, source = PurchaseSource.tabletManual, actor = adminUser,
                    idempotencyKey = "$key-$suffix"
                )
            )
            if (record) recorder.ledgerEntry(saved)
        }
        buy("recorded", record = true)
        buy("not-recorded", record = false)

        val stats = inA { statisticsService.clubStatistics(ben()) }
        assertEquals(1, stats.totalItems)
        assertTrue(stats.recording.userEnabled)
        assertEquals(true, stats.recording.groupEnabled)
        val overview = inA { statisticsService.overview(admin()) }
        assertEquals(1, overview.kpis.drinks)
        assertEquals(BigDecimal("6.00"), overview.kpis.revenue, "Umsatz aus dem Kassenbuch")
    }

    @Test
    fun `own statistic spans all groups and cross-group events show no other names`() {
        val shared = event("Gemeinsam", listOf(annaUser, benUser))
        val onlyAnna = event("Nur Anna", listOf(annaUser))
        inA { eventService.respond(shared, RsvpRequest("accepted"), anna()) }
        inA { eventService.respond(shared, RsvpRequest("declined"), ben()) }
        inA { eventService.respond(onlyAnna, RsvpRequest("maybe"), anna()) }
        event("Gruppe B", emptyList(), owner = anna(groupB), group = groupB)

        val mine = TenantContext.runWithoutTenant { levels.me(annaAnywhere(), "30") }
        assertTrue(mine.groups.map { it.stammtischId }.containsAll(listOf(groupA.toString(), groupB.toString())))
        assertEquals(2, mine.counts.first { it.feature == StatisticFeature.RSVP }.count)
        assertEquals(1, mine.counts.first { it.feature == StatisticFeature.EVENT }.count)
        assertEquals(1, mine.accepted)
        assertEquals(1, mine.groups.first { it.stammtischId == groupB.toString() }.counts.first { it.feature == StatisticFeature.EVENT }.count)

        val annaEvents = TenantContext.runWithoutTenant { levels.crossEvents(annaAnywhere(), "90") }
        val annaRows = annaEvents.events.filter { it.stammtischId == groupA.toString() || it.stammtischId == groupB.toString() }
        assertEquals(3, annaRows.size)
        val sharedRow = annaEvents.events.first { it.eventId == shared.toString() }
        assertEquals(1, sharedRow.accepted)
        assertEquals(1, sharedRow.declined)
        assertEquals("accepted", sharedRow.myRsvp)
        assertFalse(annaEvents.toString().contains("Ben $suffix"), "keine fremden Namen")
        assertFalse(annaEvents.toString().contains("Admin $suffix"), "keine fremden Namen")

        val benPrincipal = principal(benSubject, "Ben $suffix", null, UserRole.MEMBER)
        val benEvents = TenantContext.runWithoutTenant { levels.crossEvents(benPrincipal, "90") }
        assertEquals(listOf(shared.toString()), benEvents.events.filter { it.stammtischId == groupA.toString() }.map { it.eventId }, "nur sichtbare Events")
        assertTrue(benEvents.events.none { it.stammtischId == groupB.toString() })
    }

    @Test
    fun `group events, features and the event statistic`() {
        val shared = event("Abend", listOf(annaUser, benUser))
        val private = event("Privat", listOf(annaUser))
        inA { eventService.respond(shared, RsvpRequest("accepted"), anna()) }

        val groupEvents = inA { levels.groupEvents(ben(), "90") }
        assertEquals(2, groupEvents.events.size)
        assertEquals(1, groupEvents.events.first { it.eventId == shared.toString() }.accepted)
        assertEquals(1, groupEvents.events.first { it.eventId == shared.toString() }.noAnswer)

        val features = inA { levels.features(ben(), "jahr") }
        val events = features.features.first { it.feature == StatisticFeature.EVENT }
        assertEquals(2, events.triggered)
        assertEquals(StatisticFeature.RSVP, events.responseFeature)
        assertEquals(1, events.responses)
        assertEquals(1, events.breakdown.first { it.key == "accepted" }.count)
        // Gruppe B sieht nichts aus Gruppe A.
        assertEquals(0, inB { levels.features(anna(groupB), "jahr") }.features.first { it.feature == StatisticFeature.EVENT }.triggered)

        val detail = inA { levels.event(shared, anna()) }
        assertEquals(1, detail.accepted)
        assertEquals(2, detail.invited)
        assertEquals(true, detail.recording.eventEnabled)
        assertThrows(AccessDeniedException::class.java) { inA { levels.event(private, ben()) } }
    }

    @Test
    fun `members delete their own records everywhere and managers delete the group records`() {
        val shared = event("Löschen", listOf(annaUser, benUser))
        inA { eventService.respond(shared, RsvpRequest("accepted"), anna()) }
        inA { eventService.respond(shared, RsvpRequest("accepted"), ben()) }
        event("B", emptyList(), owner = anna(groupB), group = groupB)

        val deleted = TenantContext.runWithoutTenant { settings.deleteMyRecords(annaAnywhere()) }
        assertEquals(2, deleted.deleted)
        assertEquals(1, records(groupA, StatisticFeature.RSVP), "Bens Antwort bleibt")
        assertEquals(1, records(groupA, StatisticFeature.EVENT), "Event des Admins bleibt")
        assertEquals(0, records(groupB, StatisticFeature.EVENT))
        assertTrue(inA { auditLogRepository.findAll().any { it.action == AuditService.ACTION_STATISTICS_DELETED_SELF } })

        assertThrows(PermissionDeniedException::class.java) { inA { settings.deleteGroupRecords(ben()) } }
        assertThrows(PermissionDeniedException::class.java) {
            inA { settings.updateGroupSettings(UpdateStatisticsSettingsRequest(false), ben()) }
        }
        event("B2", emptyList(), owner = anna(groupB), group = groupB)
        assertEquals(2, inA { settings.deleteGroupRecords(admin()) }.deleted)
        assertEquals(0, inA { recordRepository.findAll().size })
        assertEquals(1, records(groupB, StatisticFeature.EVENT), "andere Gruppe unberührt")
        assertTrue(inA { auditLogRepository.findAll().any { it.action == AuditService.ACTION_STATISTICS_DELETED } })
    }

    @Test
    fun `switched off pages report the state and the export contains the records`() {
        event("Export", listOf(annaUser))
        inA { settings.updateGroupSettings(UpdateStatisticsSettingsRequest(false), admin()) }
        assertEquals(false, inA { levels.groupEvents(anna(), null) }.recording.groupEnabled)
        assertFalse(inA { settings.groupSettings(anna()) }.enabled)

        val export = inA { exportService.export(admin().copy(permissions = setOf(Permission.STAMMTISCH_MANAGE))) }
        @Suppress("UNCHECKED_CAST")
        val statistics = export.content["statistics"] as Map<String, Any?>
        assertEquals(false, statistics["enabled"])
        assertEquals(1, (statistics["records"] as List<*>).size)
        assertNull(export.content["statistic_records"])
    }
}
