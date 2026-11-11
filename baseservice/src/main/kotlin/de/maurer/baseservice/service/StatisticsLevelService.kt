package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.domain.StatisticFeature
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.BucketCountDto
import de.maurer.baseservice.dto.CrossEventStatisticsDto
import de.maurer.baseservice.dto.EventComparisonDto
import de.maurer.baseservice.dto.EventStatisticsDto
import de.maurer.baseservice.dto.EventTotalsDto
import de.maurer.baseservice.dto.FeatureCountDto
import de.maurer.baseservice.dto.FeatureStatDto
import de.maurer.baseservice.dto.FeatureStatisticsDto
import de.maurer.baseservice.dto.GroupEventStatisticsDto
import de.maurer.baseservice.dto.MemberCountDto
import de.maurer.baseservice.dto.MyGroupStatisticsDto
import de.maurer.baseservice.dto.MyStatisticsDto
import de.maurer.baseservice.dto.StatisticsRecordingDto
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.StatisticRecordRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.MembershipView
import de.maurer.baseservice.tenancy.StammtischMemberships
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Die Statistik-Ebenen neben der Gruppenstatistik ([StatisticsService]):
 * eigene Statistik, übergreifende Event-Statistik, Gruppen-Event-Statistik,
 * Event-Statistik und Funktions-Statistik.
 *
 * Alle Zahlen kommen aus `statistic_records` und werden in SQL summiert;
 * ausgeschaltete Erfassung taucht damit nirgends auf. Gruppenübergreifend
 * liest der Service wie der Kalender je Gruppe in einer eigenen Transaktion im
 * Kontext genau dieser Gruppe (Hibernate-Mandant und Row-Level-Security
 * bleiben aktiv) und zeigt dort keine Namen anderer Personen.
 */
@Service
class StatisticsLevelService(
    private val userService: UserService,
    private val termsConsent: TermsConsent,
    private val memberships: StammtischMemberships,
    private val tenantTransactions: TenantTransactions,
    private val eventVisibility: EventVisibility,
    private val eventService: EventService,
    private val recordRepository: StatisticRecordRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val stammtischRepository: StammtischRepository,
    private val userRepository: UserRepository
) {

    private data class Window(val period: StatisticsPeriod, val from: Instant, val now: Instant) {
        val days: Int = statisticsDays(from, now)
    }

    /** Summen einer Funktion in einem Event: Einträge und Summe der Mengen. */
    private data class Tally(val records: Int, val quantity: Int)

    private fun window(period: String?, now: Instant): Window {
        val parsed = StatisticsPeriod.parse(period)
        return Window(parsed, parsed.start(now), now)
    }

    private fun caller(principal: UserPrincipal): UserEntity {
        val caller = userService.getOrCreateUser(principal)
        termsConsent.requireAccepted(caller)
        return caller
    }

    // --- 1. Eigene Statistik ---

    fun me(principal: UserPrincipal, period: String? = null, now: Instant = Instant.now()): MyStatisticsDto {
        val caller = caller(principal)
        val window = window(period, now)
        val groups = memberships.memberships(caller.id).map { membership ->
            tenantTransactions.readInStammtisch(membership.stammtischId) { myGroup(membership, caller.id, window) }
        }
        val totals = StatisticFeature.ALL.map { feature ->
            FeatureCountDto(feature, groups.sumOf { group -> group.first.counts.firstOrNull { it.feature == feature }?.count ?: 0 })
        }
        return MyStatisticsDto(
            period = window.period.code,
            from = window.from,
            days = window.days,
            recording = StatisticsRecordingDto(userEnabled = caller.statisticsEnabled),
            total = totals.sumOf { it.count },
            counts = totals,
            accepted = groups.sumOf { it.second },
            attended = groups.sumOf { it.third },
            groups = groups.map { it.first }
        )
    }

    /** Läuft im Kontext der Gruppe [membership]. */
    private fun myGroup(membership: MembershipView, callerId: UUID, window: Window): Triple<MyGroupStatisticsDto, Int, Int> {
        val rows = recordRepository.countByFeatureForActorSince(callerId, window.from)
        val counts = StatisticFeature.ALL.map { feature ->
            FeatureCountDto(feature, rows.filter { it[0] == feature }.sumOf { count(feature, it[3], it[4]) })
        }
        val accepted = latestAnswers(recordRepository.answersOfActorSince(callerId, window.from).map { arrayOf(it[0], callerId, it[1], it[2]) })
            .values.count { it == RsvpStatus.accepted.name }
        val attended = recordRepository.countEventsOfActorSince(callerId, StatisticFeature.PURCHASE, window.from).toInt()
        val group = MyGroupStatisticsDto(
            stammtischId = membership.stammtischId.toString(),
            stammtischName = membership.stammtischName,
            groupEnabled = groupEnabled(membership.stammtischId),
            total = counts.sumOf { it.count },
            counts = counts
        )
        return Triple(group, accepted, attended)
    }

    // --- 3. Übergreifende Event-Statistik ---

    fun crossEvents(principal: UserPrincipal, period: String? = null, now: Instant = Instant.now()): CrossEventStatisticsDto {
        val caller = caller(principal)
        val window = window(period, now)
        val rows = memberships.memberships(caller.id).flatMap { membership ->
            tenantTransactions.readInStammtisch(membership.stammtischId) {
                val me = userRepository.findById(caller.id).orElseThrow()
                val events = eventVisibility.visibleEvents(eventVisibility.groupPrincipal(principal, membership), me)
                    .filter { inWindow(it, window) }
                comparison(events, mine = caller.id, group = membership)
            }
        }.sortedByDescending { it.startsAt }
        return CrossEventStatisticsDto(
            period = window.period.code,
            from = window.from,
            days = window.days,
            recording = StatisticsRecordingDto(userEnabled = caller.statisticsEnabled),
            totals = totals(rows),
            myAttended = rows.count { (it.myPurchases ?: 0) > 0 },
            myPurchases = rows.sumOf { it.myPurchases ?: 0 },
            events = rows
        )
    }

    // --- 4. Gruppen-Event-Statistik ---

    @Transactional(readOnly = true)
    fun groupEvents(principal: UserPrincipal, period: String? = null, now: Instant = Instant.now()): GroupEventStatisticsDto {
        val caller = caller(principal)
        val window = window(period, now)
        val events = eventRepository.findByStartsAtBetween(window.from, window.now).filter { inWindow(it, window) }
        val rows = comparison(events, mine = null, group = null).sortedByDescending { it.startsAt }
        return GroupEventStatisticsDto(
            period = window.period.code,
            from = window.from,
            days = window.days,
            recording = groupRecording(caller),
            totals = totals(rows),
            events = rows
        )
    }

    // --- 5. Event-Statistik ---

    @Transactional(readOnly = true)
    fun event(eventId: UUID, principal: UserPrincipal): EventStatisticsDto {
        val caller = caller(principal)
        val event = eventService.requireViewableEvent(eventId, principal)
        val row = comparison(listOf(event), mine = null, group = null).single()
        val tallies = tallies(listOf(event.id))[event.id].orEmpty()
        val consumers = recordRepository.sumByActorInEvent(StatisticFeature.PURCHASE, event.id)
            .map { (it[0] as UUID) to (it[1] as Number).toInt() }
        val names = userRepository.findAllById(consumers.map { it.first }).associate { it.id to it.displayName }
        return EventStatisticsDto(
            eventId = event.id.toString(),
            title = event.title,
            startsAt = event.startsAt,
            recording = groupRecording(caller).copy(eventEnabled = event.statisticsEnabled),
            accepted = row.accepted,
            maybe = row.maybe,
            declined = row.declined,
            noAnswer = row.noAnswer,
            invited = row.invited,
            attendees = row.attendees,
            purchases = row.purchases,
            rounds = row.rounds,
            moments = row.moments,
            reactions = row.reactions,
            media = tallies[StatisticFeature.MOMENT_MEDIA]?.quantity ?: 0,
            chatMessages = row.chatMessages,
            chatReactions = tallies[StatisticFeature.CHAT_REACTION]?.quantity ?: 0,
            topConsumers = consumers
                .map { (id, count) -> MemberCountDto(id.toString(), names[id].orEmpty(), count) }
                .sortedWith(compareByDescending<MemberCountDto> { it.count }.thenBy { it.displayName })
                .take(TOP)
        )
    }

    // --- 6. Funktions-Statistik ---

    @Transactional(readOnly = true)
    fun features(principal: UserPrincipal, period: String? = null, now: Instant = Instant.now()): FeatureStatisticsDto {
        val caller = caller(principal)
        val window = window(period, now)
        val rows = recordRepository.countByFeatureSince(window.from)
        fun sum(feature: String): Int = rows.filter { it[0] == feature }.sumOf { (it[4] as Number).toInt() }
        fun records(feature: String): Int = rows.filter { it[0] == feature }.sumOf { (it[3] as Number).toInt() }
        fun byVariant(feature: String, records: Boolean = false): List<BucketCountDto> =
            rows.filter { it[0] == feature }
                .groupBy { it[2] as String? ?: OTHER }
                .map { (variant, list) -> BucketCountDto(variant, list.sumOf { (it[if (records) 3 else 4] as Number).toInt() }) }
                .sortedByDescending { it.count }

        val features = listOf(
            FeatureStatDto(StatisticFeature.EVENT, sum(StatisticFeature.EVENT), StatisticFeature.RSVP, sum(StatisticFeature.RSVP), byVariant(StatisticFeature.RSVP)),
            FeatureStatDto(
                StatisticFeature.MOMENT, sum(StatisticFeature.MOMENT), StatisticFeature.MOMENT_REACTION, sum(StatisticFeature.MOMENT_REACTION),
                listOf(
                    BucketCountDto(StatisticFeature.MOMENT_REACTION, sum(StatisticFeature.MOMENT_REACTION)),
                    BucketCountDto(StatisticFeature.MOMENT_MEDIA, sum(StatisticFeature.MOMENT_MEDIA))
                )
            ),
            FeatureStatDto(
                StatisticFeature.CHAT_MESSAGE, sum(StatisticFeature.CHAT_MESSAGE), StatisticFeature.CHAT_REACTION,
                sum(StatisticFeature.CHAT_REACTION), byVariant(StatisticFeature.CHAT_MESSAGE)
            ),
            FeatureStatDto(StatisticFeature.INVITE_LINK, sum(StatisticFeature.INVITE_LINK), StatisticFeature.INVITE_JOIN, sum(StatisticFeature.INVITE_JOIN), emptyList()),
            FeatureStatDto(
                StatisticFeature.ROUND, records(StatisticFeature.ROUND), ROUND_MEMBERS, sum(StatisticFeature.ROUND),
                byVariant(StatisticFeature.ROUND, records = true)
            ),
            FeatureStatDto(StatisticFeature.PURCHASE, sum(StatisticFeature.PURCHASE), null, 0, byVariant(StatisticFeature.PURCHASE)),
            FeatureStatDto(StatisticFeature.TOP_UP, sum(StatisticFeature.TOP_UP), null, 0, emptyList())
        )
        return FeatureStatisticsDto(
            period = window.period.code,
            from = window.from,
            days = window.days,
            recording = groupRecording(caller),
            features = features
        )
    }

    // --- gemeinsam ---

    /**
     * Ein Vergleichseintrag je Event. Läuft im Kontext der Gruppe der Events.
     * Mit [mine] kommen die eigenen Werte dazu; mit [group] Name und Id der
     * Gruppe (gruppenübergreifend). Namen anderer Personen enthält das
     * Ergebnis nie.
     */
    private fun comparison(events: Collection<EventEntity>, mine: UUID?, group: MembershipView?): List<EventComparisonDto> {
        if (events.isEmpty()) return emptyList()
        val ids = events.map { it.id }
        val tallies = tallies(ids)
        val attendees = recordRepository.countActorsByEvent(ids, StatisticFeature.PURCHASE)
            .associate { (it[0] as UUID) to (it[1] as Number).toInt() }
        val latest = latestAnswers(recordRepository.answersForEvents(StatisticFeature.RSVP, ids))
        val open = eventParticipantRepository.countUnansweredByEvent(ids, RsvpStatus.invited)
            .associate { (it[0] as UUID) to (it[1] as Number).toInt() }
        val myCounts = mine?.let { me ->
            recordRepository.countByEventForActor(ids, me)
                .filter { it[1] == StatisticFeature.PURCHASE }
                .associate { (it[0] as UUID) to (it[2] as Number).toInt() }
        }.orEmpty()

        return events.map { event ->
            val answers = latest.filterKeys { it.first == event.id }.values
            val accepted = answers.count { it == RsvpStatus.accepted.name }
            val maybe = answers.count { it == RsvpStatus.maybe.name }
            val declined = answers.count { it == RsvpStatus.declined.name }
            val noAnswer = if (event.statisticsEnabled && groupEnabled(event.stammtischId)) open[event.id] ?: 0 else 0
            val counts = tallies[event.id].orEmpty()
            EventComparisonDto(
                eventId = event.id.toString(),
                title = event.title,
                startsAt = event.startsAt,
                status = event.status.name,
                statisticsEnabled = event.statisticsEnabled,
                stammtischId = group?.stammtischId?.toString(),
                stammtischName = group?.stammtischName,
                accepted = accepted,
                maybe = maybe,
                declined = declined,
                noAnswer = noAnswer,
                invited = accepted + maybe + declined + noAnswer,
                attendees = attendees[event.id] ?: 0,
                purchases = counts[StatisticFeature.PURCHASE]?.quantity ?: 0,
                rounds = counts[StatisticFeature.ROUND]?.records ?: 0,
                moments = counts[StatisticFeature.MOMENT]?.quantity ?: 0,
                reactions = counts[StatisticFeature.MOMENT_REACTION]?.quantity ?: 0,
                chatMessages = counts[StatisticFeature.CHAT_MESSAGE]?.quantity ?: 0,
                myPurchases = if (mine != null) myCounts[event.id] ?: 0 else null,
                myRsvp = mine?.let { me -> latest[event.id to me] }
            )
        }
    }

    private fun tallies(ids: Collection<UUID>): Map<UUID, Map<String, Tally>> =
        recordRepository.countByEvent(ids)
            .groupBy { it[0] as UUID }
            .mapValues { (_, list) ->
                list.groupBy { it[1] as String }.mapValues { (_, rows) ->
                    Tally(rows.sumOf { (it[3] as Number).toInt() }, rows.sumOf { (it[4] as Number).toInt() })
                }
            }

    /** Zeilen eventId, actorUserId, variant, occurredAt → letzte Antwort je (Event, Person). */
    private fun latestAnswers(rows: List<Array<Any?>>): Map<Pair<UUID, UUID>, String> =
        rows.filter { it[0] != null && it[1] != null && it[2] != null }
            .groupBy { (it[0] as UUID) to (it[1] as UUID) }
            .mapValues { (_, list) -> list.maxBy { it[3] as Instant }[2] as String }

    private fun totals(rows: List<EventComparisonDto>): EventTotalsDto {
        val attendances = rows.sumOf { it.attendees }
        val invited = rows.sumOf { it.invited }
        val purchases = rows.sumOf { it.purchases }
        return EventTotalsDto(
            events = rows.size,
            attendances = attendances,
            avgAttendees = ratio(attendances, rows.size),
            attendancePercent = if (invited == 0) null else Math.round(rows.sumOf { it.accepted } * 100.0 / invited).toInt(),
            purchases = purchases,
            purchasesPerEvent = ratio(purchases, rows.size),
            moments = rows.sumOf { it.moments }
        )
    }

    private fun inWindow(event: EventEntity, window: Window): Boolean =
        event.status !in HIDDEN_EVENT_STATUSES && !event.startsAt.isBefore(window.from) && !event.startsAt.isAfter(window.now)

    private fun groupRecording(caller: UserEntity): StatisticsRecordingDto =
        StatisticsRecordingDto(
            userEnabled = caller.statisticsEnabled,
            groupEnabled = groupEnabled(TenantContext.requireStammtischId())
        )

    private fun groupEnabled(stammtischId: UUID?): Boolean =
        stammtischId != null && stammtischRepository.findById(stammtischId).map { it.statisticsEnabled }.orElse(false)

    /** Runden zählen je Vorgang, alle anderen Funktionen nach Menge. */
    private fun count(feature: Any?, records: Any?, quantity: Any?): Int =
        ((if (feature == StatisticFeature.ROUND) records else quantity) as Number?)?.toInt() ?: 0

    private fun ratio(part: Int, total: Int): BigDecimal? =
        if (total == 0) null else BigDecimal(part).divide(BigDecimal(total), 1, RoundingMode.HALF_UP)

    companion object {
        const val TOP = 10
        const val OTHER = "other"

        /** Antworten zu Runden: Zahl der bedachten Personen. */
        const val ROUND_MEMBERS = "round_members"
        private val HIDDEN_EVENT_STATUSES = setOf(EventStatus.draft, EventStatus.cancelled)
    }
}

/** Länge des Zeitraums in Tagen, mindestens 1 (wie in der Gruppenstatistik). */
internal fun statisticsDays(from: Instant, now: Instant): Int =
    maxOf(1, Math.ceil(Duration.between(from, now).toMinutes() / MINUTES_PER_DAY).toInt())

private const val MINUTES_PER_DAY = 1440.0
