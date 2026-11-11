package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.domain.PurchaseSource
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.domain.StatisticFeature
import de.maurer.baseservice.domain.StatisticRecordEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.BucketCountDto
import de.maurer.baseservice.dto.CategoryCountDto
import de.maurer.baseservice.dto.CategoryShareDto
import de.maurer.baseservice.dto.ChatStatsDto
import de.maurer.baseservice.dto.ClubStatisticsDto
import de.maurer.baseservice.dto.DrinkAveragesDto
import de.maurer.baseservice.dto.DrinkStatisticsDto
import de.maurer.baseservice.dto.DrinkTotalsDto
import de.maurer.baseservice.dto.EventRsvpDto
import de.maurer.baseservice.dto.MemberCountDto
import de.maurer.baseservice.dto.MemberDrinkLineDto
import de.maurer.baseservice.dto.MemberDrinkStatsDto
import de.maurer.baseservice.dto.MemberRsvpDto
import de.maurer.baseservice.dto.MomentStatsDto
import de.maurer.baseservice.dto.OverviewKpisDto
import de.maurer.baseservice.dto.RecordDto
import de.maurer.baseservice.dto.RecordsDto
import de.maurer.baseservice.dto.StatisticsOverviewDto
import de.maurer.baseservice.dto.StatisticsRecordingDto
import de.maurer.baseservice.dto.TopDrinkDto
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.DrinkLibraryRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.StatisticRecordRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Statistik der Gruppe: Einstieg, Getränkestatistik und Übersicht.
 *
 * Grundlage sind die Statistikeinträge (`statistic_records`) der aktuellen
 * Gruppe im Zeitraum ([StatisticsPeriod]): erfasste Käufe (Stornos entfernen
 * ihren Eintrag), Antworten auf Einladungen, Moments und Chat-Nachrichten.
 * Was bei ausgeschalteter Erfassung ([StatisticsRecorder]) nicht erfasst
 * wurde, taucht damit nirgends auf. Getränkedetails (Füllmenge, Kalorien)
 * liest die Statistik zu den erfassten Käufen aus dem Kassenbuch; der Umsatz
 * kommt für die Kasse weiter vollständig aus dem Kassenbuch. Die
 * Abfragen laufen im Stammtisch-Kontext (Hibernate-Mandant und Row-Level-
 * Security); an den Client gehen nur Aggregate. Alle Auswertungen sind für alle
 * Mitglieder namentlich sichtbar, setzen aber die Zustimmung zur gültigen
 * AGB-Fassung voraus (Abschnitt „Statistiken“). Den Umsatz sieht nur, wer die
 * Finanzen lesen darf ([Permission.LEDGER_READ]).
 *
 * Liter und Kalorien kommen aus Füllmenge und Kalorien je Portion des
 * Katalogeintrags; Getränke ohne Angabe zählen dort nicht mit
 * (`withoutVolume`, `withoutKcal`).
 */
@Service
@Transactional(readOnly = true)
class StatisticsService(
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val eventRepository: EventRepository,
    private val memberRepository: StammtischMemberRepository,
    private val recordRepository: StatisticRecordRepository,
    private val stammtischRepository: StammtischRepository,
    private val userRepository: UserRepository,
    private val userService: UserService,
    private val snapshots: LedgerSnapshots,
    private val termsConsent: TermsConsent,
    private val access: StammtischAccess,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val drinkLibraryRepository: DrinkLibraryRepository
) {

    /** Ein nicht stornierter Kauf, reduziert auf das, was die Statistik braucht. */
    private class Purchase(
        val memberId: UUID,
        val memberName: String,
        val giverId: UUID,
        val giverName: String,
        val roundKey: String?,
        val key: String,
        val name: String,
        val drink: Boolean,
        val category: String,
        val volumeMl: Int?,
        val kcal: Int?,
        val eventId: UUID?,
        val eventTitle: String?,
        val createdAt: Instant,
        val source: PurchaseSource?,
        val batchKey: String,
        val amount: BigDecimal,
        val currency: String
    )

    /**
     * Eine Einladung, wie die Statistik sie sieht: die zuletzt erfasste Antwort
     * der Person, ohne erfasste Antwort nur, wenn sie noch nicht geantwortet hat.
     */
    private class Invitation(
        val event: EventEntity,
        val user: UserEntity,
        val rsvp: RsvpStatus,
        val invitationSentAt: Instant?,
        val rsvpAt: Instant?
    )

    private class Window(val period: StatisticsPeriod, val from: Instant, val now: Instant) {
        val days: Int = maxOf(1, Math.ceil(Duration.between(from, now).toMinutes() / MINUTES_PER_DAY).toInt())
        val weeks: Double get() = days / 7.0
        val months: Double get() = days / DAYS_PER_MONTH
    }

    private fun window(period: String?, now: Instant): Window {
        val parsed = StatisticsPeriod.parse(period)
        return Window(parsed, parsed.start(now), now)
    }

    private fun caller(principal: UserPrincipal): UserEntity {
        val caller = userService.getOrCreateUser(principal)
        termsConsent.requireAccepted(caller)
        return caller
    }

    private fun recording(caller: UserEntity): StatisticsRecordingDto = StatisticsRecordingDto(
        userEnabled = caller.statisticsEnabled,
        groupEnabled = TenantContext.stammtischId()?.let { id ->
            stammtischRepository.findById(id).map { it.statisticsEnabled }.orElse(false)
        } ?: false
    )

    // --- Einstieg ---

    fun clubStatistics(principal: UserPrincipal, period: String? = null, now: Instant = Instant.now()): ClubStatisticsDto {
        val caller = caller(principal)
        val window = window(period, now)
        val purchases = purchases(window.from)

        val ranking = purchases.groupBy { it.memberId }.entries
            .map { (id, list) -> MemberCountDto(id.toString(), list.first().memberName, list.size) }
            .sortedWith(compareByDescending<MemberCountDto> { it.count }.thenBy { it.displayName })
        val myIndex = ranking.indexOfFirst { it.memberId == caller.id.toString() }
        val invitations = invitations(window)

        return ClubStatisticsDto(
            period = window.period.code,
            from = window.from,
            days = window.days,
            recording = recording(caller),
            totalItems = purchases.size,
            myItems = if (myIndex >= 0) ranking[myIndex].count else 0,
            myRank = if (myIndex >= 0) myIndex + 1 else null,
            rankedMembers = ranking.size,
            topConsumers = ranking.take(TOP_RANKING),
            attendancePercent = percent(invitations.count { it.rsvp == RsvpStatus.accepted }, invitations.size)
        )
    }

    // --- Getränkestatistik ---

    fun drinkStatistics(
        principal: UserPrincipal,
        period: String? = null,
        by: String? = null,
        now: Instant = Instant.now()
    ): DrinkStatisticsDto {
        val caller = caller(principal)
        val window = window(period, now)
        val view = when (by?.trim()?.lowercase()) {
            null, "", BY_MEMBER -> BY_MEMBER
            BY_DRINK -> BY_DRINK
            else -> throw InvalidRequestException(Msg("error.field.invalid", "by"), ErrorCode.INVALID_REQUEST)
        }
        val drinks = purchases(window.from).filter { it.drink }
        val eventsWithDrinks = drinks.mapNotNull { it.eventId }.toSet().size

        return DrinkStatisticsDto(
            period = window.period.code,
            from = window.from,
            days = window.days,
            recording = recording(caller),
            totalDrinks = drinks.size,
            liters = liters(drinks),
            kcal = kcal(drinks),
            withoutVolume = drinks.count { it.volumeMl == null },
            withoutKcal = drinks.count { it.kcal == null },
            averages = DrinkAveragesDto(
                perEvent = ratio(drinks.count { it.eventId != null }, eventsWithDrinks),
                perDay = decimal(drinks.size / window.days.toDouble()),
                perWeek = decimal(drinks.size / window.weeks),
                perMonth = decimal(drinks.size / window.months)
            ),
            by = view,
            members = if (view == BY_MEMBER) memberDrinkStats(drinks, window, withLines = true) else emptyList(),
            drinks = if (view == BY_DRINK) drinkTotals(drinks, eventsWithDrinks) else emptyList()
        )
    }

    private fun memberDrinkStats(drinks: List<Purchase>, window: Window, withLines: Boolean): List<MemberDrinkStatsDto> =
        drinks.groupBy { it.memberId }.values
            .sortedWith(compareByDescending<List<Purchase>> { it.size }.thenBy { it.first().memberName })
            .mapIndexed { index, list ->
                val events = list.mapNotNull { it.eventId }.toSet().size
                MemberDrinkStatsDto(
                    rank = index + 1,
                    memberId = list.first().memberId.toString(),
                    displayName = list.first().memberName,
                    count = list.size,
                    kcal = kcal(list),
                    liters = liters(list),
                    perEvent = ratio(list.count { it.eventId != null }, events),
                    perWeek = decimal(list.size / window.weeks),
                    categories = CATEGORY_ORDER.map { group -> CategoryCountDto(group, list.count { it.category == group }) }
                        .filter { it.count > 0 },
                    drinks = if (!withLines) emptyList() else list.groupBy { it.key }.values
                        .map { same ->
                            val first = same.first()
                            MemberDrinkLineDto(first.name, first.volumeMl, same.size, first.kcal?.let { it * same.size })
                        }
                        .sortedWith(compareByDescending<MemberDrinkLineDto> { it.count }.thenBy { it.name })
                )
            }

    private fun drinkTotals(drinks: List<Purchase>, eventsWithDrinks: Int): List<DrinkTotalsDto> =
        drinks.groupBy { it.key }.values
            .sortedWith(compareByDescending<List<Purchase>> { it.size }.thenBy { it.first().name })
            .mapIndexed { index, list ->
                val first = list.first()
                DrinkTotalsDto(
                    rank = index + 1,
                    name = first.name,
                    category = first.category,
                    volumeMl = first.volumeMl,
                    count = list.size,
                    liters = first.volumeMl?.let { liters(list) },
                    kcal = first.kcal?.let { kcal(list) },
                    members = list.map { it.memberId }.toSet().size,
                    perEvent = ratio(list.count { it.eventId != null }, eventsWithDrinks)
                )
            }

    // --- Übersicht ---

    fun overview(principal: UserPrincipal, period: String? = null, now: Instant = Instant.now()): StatisticsOverviewDto {
        val caller = caller(principal)
        val window = window(period, now)
        val purchases = purchases(window.from)
        val drinks = purchases.filter { it.drink }
        val invitations = invitations(window)
        val events = eventRepository.findByStartsAtBetween(window.from, now)
            .filter { it.status !in HIDDEN_EVENT_STATUSES }
            .sortedBy { it.startsAt }
        val attendance: Map<UUID, Set<UUID>> = purchases.filter { it.eventId != null }
            .groupBy({ it.eventId!! }, { it.memberId })
            .mapValues { it.value.toSet() }
        val eventsWithDrinks = drinks.mapNotNull { it.eventId }.toSet().size

        val members = memberRepository.findAllBy().filter { it.active && it.user != null }
        val acceptedMembers = invitations.filter { it.rsvp == RsvpStatus.accepted }.map { it.user.id }.toSet()
        val activeIds = purchases.map { it.memberId }.toSet() + acceptedMembers
        val drinkers = drinks.map { it.memberId }.toSet().size

        val revenueVisible = access.has(principal, caller, Permission.LEDGER_READ)
        // Umsatz für die Kasse aus dem Kassenbuch, unabhängig von den Schaltern.
        val ledger = if (revenueVisible) purchases(window.from, recordedOnly = false) else emptyList()
        val revenue = ledger.fold(BigDecimal.ZERO) { acc, p -> acc + p.amount.abs() }
        val eventPurchases = ledger.filter { it.eventId != null }
        val revenuePerEvent = eventPurchases.map { it.eventId }.toSet().size.takeIf { it > 0 }?.let { count ->
            eventPurchases.fold(BigDecimal.ZERO) { acc, p -> acc + p.amount.abs() }
                .divide(BigDecimal(count), 2, RoundingMode.HALF_UP)
        }
        val kcal = kcal(drinks)
        val liters = liters(drinks)

        val kpis = OverviewKpisDto(
            members = members.size,
            activeMembers = members.count { it.user!!.id in activeIds },
            newMembers = members.count { !it.joinedAt.isBefore(window.from) },
            events = events.size,
            avgParticipants = if (events.isEmpty()) null else decimal(events.sumOf { attendance[it.id]?.size ?: 0 } / events.size.toDouble()),
            attendancePercent = percent(invitations.count { it.rsvp == RsvpStatus.accepted }, invitations.size),
            drinks = drinks.size,
            drinksPerEvent = ratio(drinks.count { it.eventId != null }, eventsWithDrinks),
            liters = liters,
            litersPerWeek = decimal(liters.toDouble() / window.weeks),
            kcal = kcal,
            kcalPerMember = if (drinkers == 0) null else Math.round(kcal.toDouble() / drinkers).toInt(),
            revenue = if (revenueVisible) revenue.setScale(2, RoundingMode.HALF_UP) else null,
            revenuePerEvent = if (revenueVisible) revenuePerEvent else null,
            currency = ledger.firstOrNull()?.currency ?: purchases.firstOrNull()?.currency ?: DEFAULT_CURRENCY,
            drinksPerMonth = decimal(drinks.size / window.months),
            withoutVolume = drinks.count { it.volumeMl == null },
            withoutKcal = drinks.count { it.kcal == null }
        )

        return StatisticsOverviewDto(
            period = window.period.code,
            from = window.from,
            days = window.days,
            recording = recording(caller),
            kpis = kpis,
            rsvpByEvent = rsvpByEvent(invitations),
            rsvpByMember = rsvpByMember(invitations, attendance),
            weekly = weekly(drinks, window),
            weekdays = (1..7).map { day ->
                BucketCountDto(day.toString(), drinks.count { it.createdAt.atZone(StatisticsPeriod.ZONE).dayOfWeek.value == day })
            },
            hours = HOUR_BUCKETS.map { key ->
                BucketCountDto(key, drinks.count { hourBucket(it.createdAt.atZone(StatisticsPeriod.ZONE).hour) == key })
            },
            whoDrinksWhat = memberDrinkStats(drinks, window, withLines = false),
            topDrinks = drinkTotals(drinks, eventsWithDrinks).take(TOP_DRINKS).map { TopDrinkDto(it.name, it.count, it.perEvent) },
            categories = categoryShares(drinks),
            roundGivers = roundGivers(purchases),
            moments = MomentStatsDto(
                started = recordedQuantity(StatisticFeature.MOMENT, window.from),
                reactions = recordedQuantity(StatisticFeature.MOMENT_REACTION, window.from),
                media = recordedQuantity(StatisticFeature.MOMENT_MEDIA, window.from)
            ),
            chat = chat(window),
            records = records(drinks, events, attendance, invitations)
        )
    }

    private fun rsvpByEvent(invitations: List<Invitation>): List<EventRsvpDto> =
        invitations.groupBy { it.event.id }.values
            .map { list ->
                val event = list.first().event
                EventRsvpDto(
                    eventId = event.id.toString(),
                    title = event.title,
                    startsAt = event.startsAt,
                    accepted = list.count { it.rsvp == RsvpStatus.accepted },
                    maybe = list.count { it.rsvp == RsvpStatus.maybe },
                    declined = list.count { it.rsvp == RsvpStatus.declined },
                    noAnswer = list.count { it.rsvp == RsvpStatus.invited },
                    invited = list.size
                )
            }
            .sortedByDescending { it.startsAt }
            .take(TOP_EVENTS)

    private fun rsvpByMember(
        invitations: List<Invitation>,
        attendance: Map<UUID, Set<UUID>>
    ): List<MemberRsvpDto> =
        invitations.groupBy { it.user.id }.entries
            .map { (userId, list) ->
                val accepted = list.count { it.rsvp == RsvpStatus.accepted }
                MemberRsvpDto(
                    memberId = userId.toString(),
                    displayName = list.first().user.displayName,
                    accepted = accepted,
                    maybe = list.count { it.rsvp == RsvpStatus.maybe },
                    declined = list.count { it.rsvp == RsvpStatus.declined },
                    attended = list.count { attendance[it.event.id]?.contains(userId) == true },
                    invited = list.size,
                    quotePercent = percent(accepted, list.size)
                )
            }
            .sortedWith(compareByDescending<MemberRsvpDto> { it.quotePercent ?: -1 }.thenByDescending { it.accepted }.thenBy { it.displayName })

    /** Getränke je Woche, rückwärts in 7-Tage-Abschnitten ab jetzt; älteste Woche zuerst. */
    private fun weekly(drinks: List<Purchase>, window: Window): List<Int> {
        val count = maxOf(1, Math.ceil(window.days / 7.0).toInt())
        val week = Duration.ofDays(7)
        val end = window.now.plusSeconds(1)
        return (count - 1 downTo 0).map { back ->
            val until = end.minus(week.multipliedBy(back.toLong()))
            val since = until.minus(week)
            drinks.count { !it.createdAt.isBefore(since) && it.createdAt.isBefore(until) }
        }
    }

    private fun categoryShares(drinks: List<Purchase>): List<CategoryShareDto> =
        CATEGORY_ORDER.mapNotNull { group ->
            val list = drinks.filter { it.category == group }
            if (list.isEmpty()) {
                null
            } else {
                CategoryShareDto(group, list.size, percent(list.size, drinks.size) ?: 0, liters(list), kcal(list))
            }
        }

    /**
     * Top-Rundengeber aus Buchungen mit `source = round|evening`: je Geber die
     * Zahl der Runden. Striche derselben Runde zählen einmal; alte Buchungen
     * ohne Runde zählen je Vorgang.
     */
    private fun roundGivers(purchases: List<Purchase>): List<MemberCountDto> =
        purchases.filter { it.source == PurchaseSource.round || it.source == PurchaseSource.evening }
            .groupBy { it.giverId }.values
            .map { list -> MemberCountDto(list.first().giverId.toString(), list.first().giverName, list.map { it.roundKey ?: it.batchKey }.toSet().size) }
            .sortedWith(compareByDescending<MemberCountDto> { it.count }.thenBy { it.displayName })
            .take(TOP_GIVERS)

    /** Erfasste Nachrichten im Gruppen-, Event- und Moment-Chat; Direktnachrichten zählen nicht. */
    private fun chat(window: Window): ChatStatsDto {
        val rows = recordRepository.breakdownSince(StatisticFeature.CHAT_MESSAGE, window.from)
        val byActor = rows.filter { it[0] != null }
            .groupBy { it[0] as UUID }
            .mapValues { (_, list) -> list.sumOf { (it[3] as Number).toInt() } }
        val names = userRepository.findAllById(byActor.keys).associate { it.id to it.displayName }
        val mostActive = byActor.entries
            .maxWithOrNull(compareBy<Map.Entry<UUID, Int>> { it.value }.thenByDescending { names[it.key].orEmpty() })
            ?.let { names[it.key] }
        return ChatStatsDto(
            messages = rows.sumOf { (it[3] as Number).toInt() },
            mostActive = mostActive,
            eventChats = rows.filter { it[1] == ConversationService.TYPE_EVENT && it[2] != null }.map { it[2] }.toSet().size
        )
    }

    private fun recordedQuantity(feature: String, from: Instant): Int =
        recordRepository.breakdownSince(feature, from).sumOf { (it[3] as Number).toInt() }

    private fun records(
        drinks: List<Purchase>,
        events: List<EventEntity>,
        attendance: Map<UUID, Set<UUID>>,
        invitations: List<Invitation>
    ): RecordsDto {
        val evening = drinks.filter { it.eventId != null }.groupBy { it.eventId }.values
            .maxWithOrNull(compareBy<List<Purchase>> { it.size }.thenBy { it.first().createdAt })
            ?.let { RecordDto(it.first().eventTitle ?: "", it.size) }

        val names = drinks.associate { it.memberId to it.memberName } +
            invitations.map { it.user.id to it.user.displayName }
        var streak: RecordDto? = null
        attendance.values.flatten().toSet().forEach { memberId ->
            var run = 0
            var best = 0
            events.forEach { event ->
                run = if (attendance[event.id]?.contains(memberId) == true) run + 1 else 0
                best = maxOf(best, run)
            }
            val current = streak
            if (best > 0 && (current == null || best > current.value)) {
                streak = RecordDto(names[memberId] ?: "", best)
            }
        }

        val fastest = invitations
            .filter { it.rsvp == RsvpStatus.accepted && it.rsvpAt != null && it.invitationSentAt != null }
            .filter { !it.rsvpAt!!.isBefore(it.invitationSentAt!!) }
            .minByOrNull { Duration.between(it.invitationSentAt, it.rsvpAt) }
            ?.let { RecordDto(it.user.displayName, Duration.between(it.invitationSentAt, it.rsvpAt).toMinutes().toInt()) }

        return RecordsDto(mostDrinksEvening = evening, longestStreak = streak, fastestRsvp = fastest)
    }

    // --- Daten ---

    /**
     * Käufe im Zeitraum. Mit [recordedOnly] (Standard) nur die erfassten, also
     * die mit Statistikeintrag; sonst alle nicht stornierten Käufe des
     * Kassenbuchs (Umsatz).
     */
    private fun purchases(from: Instant, recordedOnly: Boolean = true): List<Purchase> {
        val entries = snapshots.attach(ledgerEntryRepository.findByCreatedAtGreaterThanEqual(from))
        val reversed = entries.mapNotNull { it.reversesEntry?.id }.toSet()
        val recorded = if (recordedOnly) recordRepository.sourceIdsSince(StatisticFeature.PURCHASE, from).toSet() else emptySet()
        val booked = entries
            .filter { it.entryType == LedgerEntryType.purchase && it.id !in reversed && it.member != null }
            .filter { !recordedOnly || it.id in recorded }
            .map { toPurchase(it) }
        return if (recordedOnly) booked + foreignDrinks(from) else booked
    }

    /**
     * Fremdgetränke (Issue #110): nur in `statistic_records`, ohne Buchung und
     * ohne Event. Sie zählen wie Getränke, aber nie bei einem Event und nie im
     * Umsatz. Getränkedaten kommen aus dem Katalog der Gruppe oder, wenn das
     * Getränk nur dort steht, aus der Getränkedatenbank; ein Katalogeintrag,
     * der aus der Getränkedatenbank übernommen wurde, fasst beide zusammen.
     */
    private fun foreignDrinks(from: Instant): List<Purchase> {
        val records = recordRepository.findByFeatureAndOccurredAtGreaterThanEqual(StatisticFeature.FOREIGN_DRINK, from)
            .filter { it.actorUserId != null }
        if (records.isEmpty()) return emptyList()
        val catalog = drinkCatalogRepository.findAllById(records.mapNotNull { it.drinkId }.toSet()).associateBy { it.id }
        val libraryIds = records.filter { it.drinkId == null }.mapNotNull { it.libraryDrinkId }.toSet()
        val library = drinkLibraryRepository.findAllById(libraryIds).associateBy { it.id }
        val adopted = if (libraryIds.isEmpty()) emptyMap() else
            drinkCatalogRepository.findByLibraryDrinkIdIn(libraryIds).associateBy { it.libraryDrinkId }
        val users = userRepository.findAllById(records.mapNotNull { it.actorUserId }.toSet()).associateBy { it.id }
        return records.mapNotNull { record -> toForeignPurchase(record, users[record.actorUserId] ?: return@mapNotNull null, catalog, library, adopted) }
    }

    private fun toForeignPurchase(
        record: StatisticRecordEntity,
        user: UserEntity,
        catalog: Map<UUID, de.maurer.baseservice.domain.DrinkCatalogEntity>,
        library: Map<UUID, de.maurer.baseservice.domain.DrinkLibraryEntity>,
        adopted: Map<UUID?, de.maurer.baseservice.domain.DrinkCatalogEntity>
    ): Purchase {
        val drink = record.drinkId?.let { catalog[it] } ?: record.libraryDrinkId?.let { adopted[it] }
        val libraryDrink = if (drink == null) record.libraryDrinkId?.let { library[it] } else null
        val name = drink?.name ?: libraryDrink?.name ?: UNKNOWN_ITEM
        return Purchase(
            memberId = user.id,
            memberName = user.displayName,
            giverId = user.id,
            giverName = user.displayName,
            roundKey = null,
            key = drink?.id?.toString() ?: libraryDrink?.id?.let { "library:$it" } ?: "name:$name",
            name = name,
            drink = true,
            category = categoryGroup(drink?.category ?: libraryDrink?.category, name),
            volumeMl = drink?.volumeMl ?: libraryDrink?.volumeMl,
            kcal = drink?.kcalPerServing ?: libraryDrink?.kcalPerServing,
            eventId = null,
            eventTitle = null,
            createdAt = record.occurredAt,
            source = null,
            batchKey = record.id.toString(),
            amount = BigDecimal.ZERO,
            currency = DEFAULT_CURRENCY
        )
    }

    /**
     * Wer getrunken hat: bei Runden die eingeladene Person (`beneficiary`),
     * sonst das Mitglied der Buchung. Bezahlt hat immer das Mitglied der Buchung.
     */
    private fun toPurchase(entry: LedgerEntryEntity): Purchase {
        val giver = entry.member!!
        val member = entry.beneficiary ?: giver
        val drink = entry.drink
        val snapshot = entry.purchaseSnapshot
        val name = snapshot?.drinkName ?: drink?.name ?: snapshot?.foodName ?: entry.food?.name ?: UNKNOWN_ITEM
        val isDrink = drink != null || snapshot?.itemType == ITEM_DRINK
        return Purchase(
            memberId = member.id,
            memberName = member.displayName,
            giverId = giver.id,
            giverName = giver.displayName,
            roundKey = entry.round?.id?.toString(),
            key = drink?.id?.toString() ?: "name:$name",
            name = drink?.name ?: name,
            drink = isDrink,
            category = categoryGroup(drink?.category, drink?.name ?: name),
            volumeMl = drink?.volumeMl,
            kcal = drink?.kcalPerServing,
            eventId = entry.event?.id,
            eventTitle = entry.event?.title,
            createdAt = entry.createdAt,
            source = entry.source,
            batchKey = entry.idempotencyKey.substringBefore('#').ifBlank { entry.id.toString() },
            amount = entry.amount,
            currency = entry.currency
        )
    }

    /**
     * Einladungen zu Events, die im Zeitraum (bis 30 Tage voraus) beginnen;
     * ohne Entwürfe und abgesagte Events. Es zählt die zuletzt erfasste Antwort
     * der Person; wer geantwortet hat, ohne dass es erfasst wurde, zählt nicht.
     * Noch offene Einladungen zählen nur, wenn weder Person noch Event die
     * Statistik ausgeschaltet haben. Wer schon geantwortet hat, gilt auch ohne
     * Versandzeitpunkt als eingeladen.
     */
    private fun invitations(window: Window): List<Invitation> {
        val participants = eventParticipantRepository.findForEventsStartingBetween(window.from, window.now.plus(UPCOMING))
            .filter { it.event!!.status !in HIDDEN_EVENT_STATUSES && it.user != null }
        if (participants.isEmpty()) return emptyList()
        val answers = recordRepository.answersForEvents(StatisticFeature.RSVP, participants.map { it.event!!.id }.toSet())
            .filter { it[0] != null && it[1] != null && it[2] != null }
            .groupBy { (it[0] as UUID) to (it[1] as UUID) }
            .mapValues { (_, list) -> list.maxBy { it[3] as Instant } }
        return participants.mapNotNull { participant ->
            val event = participant.event!!
            val user = participant.user!!
            val answer = answers[event.id to user.id]
            val status = answer?.let { RsvpStatus.fromValue(it[2] as String) }
            when {
                status != null -> Invitation(event, user, status, participant.invitationSentAt, answer[3] as Instant)
                participant.rsvp == RsvpStatus.invited && participant.invitationSentAt != null &&
                    event.statisticsEnabled && user.statisticsEnabled ->
                    Invitation(event, user, RsvpStatus.invited, participant.invitationSentAt, null)
                else -> null
            }
        }
    }

    private fun liters(list: List<Purchase>): BigDecimal =
        BigDecimal(list.sumOf { it.volumeMl ?: 0 }).divide(BigDecimal(1000), 1, RoundingMode.HALF_UP)

    private fun kcal(list: List<Purchase>): Int = list.sumOf { it.kcal ?: 0 }

    private fun ratio(part: Int, total: Int): BigDecimal? = if (total == 0) null else decimal(part / total.toDouble())

    private fun decimal(value: Double): BigDecimal =
        if (value.isNaN() || value.isInfinite()) BigDecimal.ZERO.setScale(1) else BigDecimal(value).setScale(1, RoundingMode.HALF_UP)

    private fun percent(part: Int, total: Int): Int? =
        if (total == 0) null else Math.round(part * 100.0 / total).toInt()

    companion object {
        const val BY_MEMBER = "member"
        const val BY_DRINK = "drink"
        const val TOP_RANKING = 10
        const val TOP_DRINKS = 6
        const val TOP_EVENTS = 8
        const val TOP_GIVERS = 5
        const val DEFAULT_CURRENCY = "EUR"
        const val UNKNOWN_ITEM = "?"
        const val ITEM_DRINK = "DRINK"
        private const val MINUTES_PER_DAY = 1440.0
        private const val DAYS_PER_MONTH = 30.4375
        private val UPCOMING: Duration = Duration.ofDays(30)
        private val HIDDEN_EVENT_STATUSES = setOf(EventStatus.draft, EventStatus.cancelled)

        const val CATEGORY_BEER = "beer"
        const val CATEGORY_NON_ALCOHOLIC = "nonAlcoholic"
        const val CATEGORY_SPIRITS = "spirits"
        const val CATEGORY_WINE = "wineSparkling"
        const val CATEGORY_OTHER = "other"
        val CATEGORY_ORDER = listOf(CATEGORY_BEER, CATEGORY_NON_ALCOHOLIC, CATEGORY_SPIRITS, CATEGORY_WINE, CATEGORY_OTHER)

        /** Uhrzeit-Abschnitte: vor 18 Uhr, je Stunde bis 22 Uhr, ab 23 Uhr (bis 5 Uhr früh). */
        val HOUR_BUCKETS = listOf("lt18", "18", "19", "20", "21", "22", "ge23")

        fun hourBucket(hour: Int): String = when {
            hour >= 23 || hour < 6 -> "ge23"
            hour < 18 -> "lt18"
            else -> hour.toString()
        }

        private val NON_ALCOHOLIC = Regex("alkoholfrei|alkoholfreies|0,0|0\\.0|wasser|softdrink|limo|cola|spezi|saft|schorle|energy|kaffee|tee|malz|mate|tonic|non-alcoholic|alcohol-free|water|juice|soda")
        private val SPIRITS = Regex("spirituose|schnaps|likör|likoer|korn|obstler|brand|geist|whisk|wodka|vodka|gin\\b|rum\\b|tequila|ouzo|jäger|jaeger|kurzer|shot|aperitif|digestif")
        private val WINE = Regex("wein|sekt|prosecco|champagner|cider|cidre|secco|spritz|wine|sparkling")
        private val BEER = Regex("bier|radler|pils|weizen|weiß|weiss|helles|export|bock|kölsch|koelsch|alt\\b|lager|ipa|ale\\b|märzen|maerzen|zwickel|beer")

        /**
         * Bildet das freie Feld `category` (sonst den Namen) auf feste Gruppen ab:
         * Bier, Alkoholfrei, Schnaps, Wein & Sekt, Sonstiges. Alkoholfreies Bier
         * zählt als alkoholfrei.
         */
        fun categoryGroup(category: String?, name: String?): String =
            classify(category?.lowercase()) ?: classify(name?.lowercase()) ?: CATEGORY_OTHER

        private fun classify(text: String?): String? = when {
            text.isNullOrBlank() -> null
            NON_ALCOHOLIC.containsMatchIn(text) -> CATEGORY_NON_ALCOHOLIC
            SPIRITS.containsMatchIn(text) -> CATEGORY_SPIRITS
            WINE.containsMatchIn(text) -> CATEGORY_WINE
            BEER.containsMatchIn(text) -> CATEGORY_BEER
            else -> null
        }
    }
}
