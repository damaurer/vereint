package de.maurer.baseservice

import de.maurer.baseservice.domain.AccountingMode
import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.domain.PurchaseSource
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.domain.StatisticFeature
import de.maurer.baseservice.domain.StatisticKind
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AcceptTermsRequest
import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.MembershipService
import de.maurer.baseservice.service.PlatformService
import de.maurer.baseservice.service.StatisticsPeriod
import de.maurer.baseservice.service.StatisticsRecorder
import de.maurer.baseservice.service.StatisticsService
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
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import java.math.BigDecimal
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.time.LocalTime
import java.time.ZonedDateTime
import java.util.UUID

/**
 * Kennzahlen der Statistik mit festen Testdaten in einer eigenen Gruppe
 * (H2 mit den echten Migrationen). Zeitpunkte der Buchungen werden nach dem
 * Speichern per SQL gesetzt, weil `created_at` sonst die aktuelle Zeit erhält.
 */
@SpringBootTest
@ActiveProfiles("test")
class StatisticsServiceIntegrationTest @Autowired constructor(
    private val statisticsService: StatisticsService,
    private val termsService: TermsService,
    private val platformService: PlatformService,
    private val userService: UserService,
    private val membershipService: MembershipService,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val jdbcTemplate: JdbcTemplate,
    private val statisticsRecorder: StatisticsRecorder
) {

    private lateinit var group: UUID
    private lateinit var anna: UserPrincipal
    private lateinit var ben: UserPrincipal
    private lateinit var kasse: UserPrincipal
    private lateinit var annaUser: UserEntity
    private lateinit var benUser: UserEntity
    private lateinit var firstEvening: ZonedDateTime
    private lateinit var secondEvening: ZonedDateTime
    private val now: Instant = Instant.now()

    private fun <T> inGroup(block: () -> T): T = TenantContext.runIn(group, block)

    private fun principal(name: String, role: String) = UserPrincipal(
        subject = "kc-stats-$name-${UUID.randomUUID()}",
        displayName = name,
        roles = setOf(role),
        stammtischId = group.toString()
    )

    private fun join(principal: UserPrincipal, role: String, accept: Boolean = true): UserEntity = inGroup {
        val user = userService.getOrCreateUser(principal)
        membershipService.addMember(user, setOf(role))
        if (accept) termsService.accept(principal, AcceptTermsRequest(acceptTerms = true))
        user
    }

    private fun drink(name: String, category: String, volumeMl: Int?, kcal: Int?) = inGroup {
        drinkCatalogRepository.saveAndFlush(
            DrinkCatalogEntity(
                name = name, category = category, volumeMl = volumeMl, kcalPerServing = kcal,
                defaultPrice = BigDecimal("2.50"), status = DrinkStatus.approved, active = true
            )
        )
    }

    private fun buy(
        member: UserEntity,
        drink: DrinkCatalogEntity,
        event: EventEntity?,
        at: Instant,
        source: PurchaseSource? = PurchaseSource.pwaBarcode,
        key: String = UUID.randomUUID().toString()
    ): LedgerEntryEntity = inGroup {
        val entry = ledgerEntryRepository.saveAndFlush(
            LedgerEntryEntity(
                entryType = LedgerEntryType.purchase, member = member, drink = drink, event = event,
                amount = BigDecimal("2.50"), accountingMode = AccountingMode.credit, source = source,
                actor = member, idempotencyKey = key
            )
        )
        jdbcTemplate.update("UPDATE ledger_entries SET created_at = ? WHERE id = ?", Timestamp.from(at), entry.id)
        // Wie LedgerService: der Kauf wird erfasst (Schalter stehen auf an).
        statisticsRecorder.ledgerEntry(entry)
        jdbcTemplate.update("UPDATE statistic_records SET occurred_at = ? WHERE source_id = ?", Timestamp.from(at), entry.id)
        entry
    }

    private fun invite(event: EventEntity, user: UserEntity, rsvp: RsvpStatus, sentAt: Instant, answeredAt: Instant? = null) = inGroup {
        val participant = eventParticipantRepository.saveAndFlush(
            EventParticipantEntity(event = event, user = user, rsvp = rsvp, invitationSentAt = sentAt, rsvpAt = answeredAt)
        )
        if (rsvp != RsvpStatus.invited) {
            // Wie EventService.respond: die Antwort wird erfasst.
            statisticsRecorder.record(
                StatisticFeature.RSVP, kind = StatisticKind.RESPONSE, actor = user, event = event,
                variant = rsvp.name, respondsTo = event.id, sourceId = participant.id, occurredAt = answeredAt ?: sentAt
            )
        }
        participant
    }

    @BeforeEach
    fun setup() {
        val platform = UserPrincipal(
            subject = "kc-stats-platform-${UUID.randomUUID()}", displayName = "Plattform",
            roles = setOf(UserRole.ADMIN), platformAdmin = true
        )
        group = UUID.fromString(platformService.create(CreateStammtischRequest(name = "Statistik"), platform).id)
        anna = principal("Anna", UserRole.MEMBER)
        ben = principal("Ben", UserRole.MEMBER)
        kasse = principal("Kasse", UserRole.BOARD)
        annaUser = join(anna, UserRole.MEMBER)
        benUser = join(ben, UserRole.MEMBER)
        val kasseUser = join(kasse, UserRole.BOARD)

        val helles = drink("Helles", "Bier", 500, 210)
        val schorle = drink("Apfelschorle", "Saft & Schorle", 500, 120)
        val obstler = drink("Obstler", "Spirituose", 20, null)

        val zone = StatisticsPeriod.ZONE
        firstEvening = now.atZone(zone).minusDays(10).with(LocalTime.of(20, 30))
        secondEvening = now.atZone(zone).minusDays(3).with(LocalTime.of(19, 15))
        val first = inGroup {
            eventRepository.saveAndFlush(EventEntity(title = "Erster Abend", startsAt = firstEvening.minusHours(1).toInstant(), status = EventStatus.completed, owner = kasseUser))
        }
        val second = inGroup {
            eventRepository.saveAndFlush(EventEntity(title = "Zweiter Abend", startsAt = secondEvening.minusHours(1).toInstant(), status = EventStatus.completed, owner = kasseUser))
        }

        val sent = first.startsAt.minus(Duration.ofDays(2))
        invite(first, annaUser, RsvpStatus.accepted, sent, sent.plus(Duration.ofMinutes(5)))
        invite(first, benUser, RsvpStatus.declined, sent, sent.plus(Duration.ofHours(3)))
        invite(first, kasseUser, RsvpStatus.maybe, sent, sent.plus(Duration.ofHours(1)))
        invite(second, annaUser, RsvpStatus.accepted, sent, sent.plus(Duration.ofHours(2)))
        invite(second, benUser, RsvpStatus.invited, sent)

        val e1 = firstEvening.toInstant()
        val e2 = secondEvening.toInstant()
        repeat(3) { buy(annaUser, helles, first, e1) }
        buy(annaUser, obstler, first, e1)
        repeat(2) { buy(annaUser, helles, second, e2) }
        buy(benUser, schorle, first, e1)
        buy(benUser, helles, second, e2, PurchaseSource.round, "runde-1#round#a")
        buy(benUser, helles, second, e2, PurchaseSource.round, "runde-1#round#b")

        // Storniert: zählt nirgends mit.
        val reversed = buy(benUser, helles, second, e2)
        inGroup {
            ledgerEntryRepository.saveAndFlush(
                LedgerEntryEntity(
                    entryType = LedgerEntryType.correction, member = benUser, drink = helles, event = second,
                    amount = BigDecimal("-2.50"), actor = kasseUser, idempotencyKey = UUID.randomUUID().toString(),
                    reversesEntry = reversed
                )
            )
        }
        // Außerhalb von 30 und 90 Tagen.
        buy(kasseUser, helles, null, now.minus(Duration.ofDays(200)))
    }

    @Test
    fun `entry page counts tallies, rank and rsvp rate in the period`() {
        val stats = inGroup { statisticsService.clubStatistics(anna, "30", now) }

        assertEquals("30", stats.period)
        assertEquals(9, stats.totalItems)
        assertEquals(6, stats.myItems)
        assertEquals(1, stats.myRank)
        assertEquals(2, stats.rankedMembers)
        assertEquals(listOf("Anna", "Ben"), stats.topConsumers.map { it.displayName })
        assertEquals(listOf(6, 3), stats.topConsumers.map { it.count })
        // 2 Zusagen bei 5 Einladungen.
        assertEquals(40, stats.attendancePercent)
    }

    @Test
    fun `drink statistics sum liters and calories and skip drinks without values`() {
        val stats = inGroup { statisticsService.drinkStatistics(ben, "90", "member", now) }

        assertEquals(9, stats.totalDrinks)
        // 7 × 0,5 l Helles + 0,5 l Schorle + 0,02 l Obstler.
        assertEquals(BigDecimal("4.0"), stats.liters)
        assertEquals(7 * 210 + 120, stats.kcal)
        assertEquals(1, stats.withoutKcal)
        assertEquals(0, stats.withoutVolume)
        assertEquals(BigDecimal("4.5"), stats.averages.perEvent)

        val first = stats.members.first()
        assertEquals("Anna", first.displayName)
        assertEquals(1, first.rank)
        assertEquals(6, first.count)
        assertEquals(5 * 210, first.kcal)
        assertEquals(BigDecimal("3.0"), first.perEvent)
        assertEquals(mapOf("beer" to 5, "spirits" to 1), first.categories.associate { it.category to it.count })
        assertEquals(listOf("Helles", "Obstler"), first.drinks.map { it.name })
        assertNull(first.drinks.last().kcal)

        val second = stats.members[1]
        assertEquals(mapOf("beer" to 2, "nonAlcoholic" to 1), second.categories.associate { it.category to it.count })
        assertTrue(stats.drinks.isEmpty())
    }

    @Test
    fun `drink statistics by drink rank the drinks`() {
        val stats = inGroup { statisticsService.drinkStatistics(anna, "30", "drink", now) }

        assertTrue(stats.members.isEmpty())
        assertEquals(listOf("Helles", "Apfelschorle", "Obstler"), stats.drinks.map { it.name })
        val helles = stats.drinks.first()
        assertEquals(7, helles.count)
        assertEquals(2, helles.members)
        assertEquals(BigDecimal("3.5"), helles.liters)
        assertEquals("beer", helles.category)
    }

    @Test
    fun `overview shows rsvps, attendance, rhythm, community and records`() {
        val overview = inGroup { statisticsService.overview(anna, "30", now) }

        // Anna, Ben, Kasse und die Plattform-Admin, die die Gruppe angelegt hat.
        assertEquals(4, overview.kpis.members)
        assertEquals(2, overview.kpis.events)
        assertEquals(9, overview.kpis.drinks)
        assertNull(overview.kpis.revenue, "Umsatz nur mit Leserecht auf die Finanzen")

        val firstEvent = overview.rsvpByEvent.first { it.title == "Erster Abend" }
        assertEquals(1, firstEvent.accepted)
        assertEquals(1, firstEvent.maybe)
        assertEquals(1, firstEvent.declined)
        assertEquals(0, firstEvent.noAnswer)
        assertEquals(1, overview.rsvpByEvent.first { it.title == "Zweiter Abend" }.noAnswer)

        val annaRsvp = overview.rsvpByMember.first { it.displayName == "Anna" }
        assertEquals(2, annaRsvp.accepted)
        assertEquals(2, annaRsvp.attended)
        assertEquals(100, annaRsvp.quotePercent)
        val benRsvp = overview.rsvpByMember.first { it.displayName == "Ben" }
        assertEquals(1, benRsvp.declined)
        assertEquals(2, benRsvp.attended)
        assertEquals(0, benRsvp.quotePercent)

        assertEquals(9, overview.weekly.sum())
        assertEquals(5, overview.weekly.size)
        val weekdays = overview.weekdays.associate { it.key to it.count }
        if (firstEvening.dayOfWeek == secondEvening.dayOfWeek) {
            assertEquals(9, weekdays[firstEvening.dayOfWeek.value.toString()])
        } else {
            assertEquals(5, weekdays[firstEvening.dayOfWeek.value.toString()])
            assertEquals(4, weekdays[secondEvening.dayOfWeek.value.toString()])
        }
        val hours = overview.hours.associate { it.key to it.count }
        assertEquals(5, hours["20"])
        assertEquals(4, hours["19"])

        assertEquals(listOf("beer", "nonAlcoholic", "spirits"), overview.categories.map { it.category })
        assertEquals(78, overview.categories.first().sharePercent)
        assertEquals("Helles", overview.topDrinks.first().name)

        assertEquals(1, overview.roundGivers.size)
        assertEquals("Ben", overview.roundGivers.first().displayName)
        assertEquals(1, overview.roundGivers.first().count)

        assertEquals("Erster Abend", overview.records.mostDrinksEvening?.label)
        assertEquals(5, overview.records.mostDrinksEvening?.value)
        assertEquals(2, overview.records.longestStreak?.value)
        assertEquals("Anna", overview.records.fastestRsvp?.label)
        assertEquals(5, overview.records.fastestRsvp?.value)
        assertNotNull(overview.moments)
    }

    @Test
    fun `revenue is only shown to the board`() {
        val overview = inGroup { statisticsService.overview(kasse, "90", now) }

        assertEquals(BigDecimal("22.50"), overview.kpis.revenue)
        assertEquals(BigDecimal("11.25"), overview.kpis.revenuePerEvent)
    }

    @Test
    fun `statistics require consent to the current terms`() {
        val newcomer = principal("Neu", UserRole.MEMBER)
        join(newcomer, UserRole.MEMBER, accept = false)

        val denied = assertThrows(AccessDeniedException::class.java) {
            inGroup { statisticsService.clubStatistics(newcomer, "30", now) }
        }
        assertEquals(ErrorCode.TERMS_REQUIRED, denied.errorCode)
        assertFalse(inGroup { termsService.status(newcomer) }.accepted)

        val accepted = inGroup { termsService.accept(newcomer, AcceptTermsRequest(acceptTerms = true)) }
        assertTrue(accepted.accepted)
        assertEquals(accepted.currentVersion, accepted.acceptedVersion)
        assertEquals(0, inGroup { statisticsService.clubStatistics(newcomer, "30", now) }.myItems)
    }

    @Test
    fun `accepting requires the explicit flag`() {
        val newcomer = principal("Zoe", UserRole.MEMBER)
        join(newcomer, UserRole.MEMBER, accept = false)
        assertThrows(InvalidRequestException::class.java) {
            inGroup { termsService.accept(newcomer, AcceptTermsRequest(acceptTerms = false)) }
        }
    }

    @Test
    fun `period year starts on the first of january and unknown periods are rejected`() {
        val start = StatisticsPeriod.YEAR.start(now).atZone(StatisticsPeriod.ZONE)
        assertEquals(1, start.dayOfYear)
        assertEquals(LocalTime.MIDNIGHT, start.toLocalTime())
        assertEquals(now.atZone(StatisticsPeriod.ZONE).year, start.year)

        val year = inGroup { statisticsService.clubStatistics(anna, "year", now) }
        assertEquals("year", year.period)
        assertEquals(start.toInstant(), year.from)

        assertThrows(InvalidRequestException::class.java) {
            inGroup { statisticsService.clubStatistics(anna, "365", now) }
        }
    }

    @Test
    fun `categories map to fixed groups`() {
        val group = StatisticsService::categoryGroup
        assertEquals("beer", group("Bier", null))
        assertEquals("beer", group("Biermischgetränk", "Radler"))
        assertEquals("nonAlcoholic", group("Bier alkoholfrei", null))
        assertEquals("nonAlcoholic", group("Softdrink", null))
        assertEquals("spirits", group("Spirituose", null))
        assertEquals("wineSparkling", group("Sekt", null))
        assertEquals("beer", group(null, "Weißbier 0,5 l"))
        assertEquals("other", group(null, "Brezel"))
    }
}
