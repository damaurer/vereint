package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventFoodEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventSeriesEntity
import de.maurer.baseservice.domain.EventSeriesInviteeEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.domain.StatisticFeature
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateEventRequest
import de.maurer.baseservice.dto.EventDto
import de.maurer.baseservice.dto.InviteMembersRequest
import de.maurer.baseservice.dto.RecurrencePreviewDto
import de.maurer.baseservice.dto.RecurrencePreviewRequest
import de.maurer.baseservice.dto.RecurrenceRequest
import de.maurer.baseservice.dto.UpdateEventRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.ChatMessageRepository
import de.maurer.baseservice.repository.ConversationRepository
import de.maurer.baseservice.repository.EventDrinkRepository
import de.maurer.baseservice.repository.EventFoodRepository
import de.maurer.baseservice.repository.EventGuestRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.EventSeriesInviteeRepository
import de.maurer.baseservice.repository.EventSeriesRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.MomentSessionRepository
import de.maurer.baseservice.repository.RoundRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.recurrence.RecurrenceExpander
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.StammtischJobs
import de.maurer.baseservice.tenancy.StammtischMembers
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/**
 * Wiederkehrende Events (Serien).
 *
 * Eine Serie speichert Rhythmus und Vorlage; jeder Termin ist ein normales
 * Event mit eigener Zu-/Absage, eigenem Chat, eigener Erinnerung und eigener
 * Statistik. Angelegt werden die Termine der nächsten [HORIZON_DAYS] Tage,
 * höchstens [MAX_AHEAD] kommende je Serie; ein Hintergrundjob legt laufend
 * nach. Termine in der Vergangenheit bleiben unangetastet.
 *
 * Bearbeiten wie in Kalender-Apps: „nur dieser Termin“ (siehe
 * [EventService.updateEvent], der Termin wird dabei von der Serie gelöst),
 * „dieser und alle folgenden“ (die Serie wird an diesem Termin geteilt) und
 * „alle Termine“ (alle kommenden Termine der Serie). Wegfallende Termine werden
 * gelöscht, solange dort noch nichts passiert ist (keine Antwort, kein Chat,
 * keine Buchung, kein Moment, kein Gast); sonst werden sie abgesagt.
 */
@Service
@Transactional
class EventSeriesService(
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val seriesRepository: EventSeriesRepository,
    private val seriesInviteeRepository: EventSeriesInviteeRepository,
    private val members: StammtischMembers,
    private val access: StammtischAccess,
    private val userService: UserService,
    private val eventService: EventService,
    private val eventInvitationService: EventInvitationService,
    private val statisticsRecorder: StatisticsRecorder,
    private val conversationRepository: ConversationRepository,
    private val chatMessageRepository: ChatMessageRepository,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val roundRepository: RoundRepository,
    private val momentSessionRepository: MomentSessionRepository,
    private val eventGuestRepository: EventGuestRepository,
    private val eventDrinkRepository: EventDrinkRepository,
    private val eventFoodRepository: EventFoodRepository,
    private val stammtischJobs: StammtischJobs,
    transactionManager: PlatformTransactionManager
) {

    private val tx = TransactionTemplate(transactionManager)

    // ------------------------------------------------------------------ Vorschau

    @Transactional(readOnly = true)
    fun preview(request: RecurrencePreviewRequest): RecurrencePreviewDto {
        val startsAt = request.startsAt ?: throw required("startsAt")
        val recurrence = request.recurrence ?: throw required("recurrence")
        val zone = EventSeriesSupport.DEFAULT_ZONE
        val local = startsAt.atZone(zone)
        val plan = EventSeriesSupport.plan(recurrence, local.toLocalDate())
        val limit = request.limit ?: 8
        val dates = plan.dates(local.toLocalDate(), local.toLocalDate().plusYears(PREVIEW_YEARS))
        return RecurrencePreviewDto(
            dates = dates.take(limit).map { RecurrenceExpander.localStart(it, local.toLocalTime(), zone).toInstant() },
            more = dates.size > limit,
            rrule = plan.rule?.toRRule()
        )
    }

    // ------------------------------------------------------------------ Anlegen

    fun create(request: CreateEventRequest, principal: UserPrincipal): EventDto {
        val caller = userService.getOrCreateUser(principal)
        if (!access.has(principal, caller, Permission.EVENT_CREATE)) {
            throw AccessDeniedException(Msg("error.event.createDenied"), ErrorCode.ACCESS_DENIED)
        }
        val title = request.title?.trim().orEmpty()
        if (title.isBlank()) throw InvalidRequestException(Msg("error.field.blank", "title"), ErrorCode.INVALID_REQUEST)
        val startsAt = request.startsAt ?: throw required("startsAt")
        if (request.endsAt != null && request.endsAt.isBefore(startsAt)) {
            throw InvalidRequestException(Msg("error.event.endsBeforeStart"), ErrorCode.INVALID_REQUEST)
        }
        val recurrence = request.recurrence ?: throw required("recurrence")
        val zone = EventSeriesSupport.DEFAULT_ZONE
        val local = startsAt.atZone(zone)
        val plan = EventSeriesSupport.plan(recurrence, local.toLocalDate())

        val series = EventSeriesEntity(
            owner = caller,
            title = title,
            description = request.description?.trim()?.ifBlank { null },
            location = request.location?.trim()?.ifBlank { null },
            startsOn = local.toLocalDate(),
            startTime = local.toLocalTime().withSecond(0).withNano(0),
            durationMinutes = request.endsAt?.let { Duration.between(startsAt, it).toMinutes().toInt() },
            timeZone = zone.id,
            status = if (request.status == EventStatus.published.name) EventStatus.published else EventStatus.draft,
            inviteLeadDays = recurrence.inviteLeadDays,
            reminderHoursBefore = request.reminderHoursBefore,
            statisticsEnabled = request.statisticsEnabled ?: true,
            inviteAllMembers = request.inviteAllMembers == true
        )
        EventSeriesSupport.store(series, plan)
        val saved = seriesRepository.save(series)
        if (!saved.inviteAllMembers) {
            members.requireActiveUsers(request.inviteUserIds.orEmpty().map { parseUserId(it) })
                .filter { it.id != caller.id }
                .forEach { seriesInviteeRepository.save(EventSeriesInviteeEntity(series = saved, user = it)) }
        }
        val created = reconcile(saved, today(saved), applyTemplate = false)
        val first = created.minByOrNull { it.startsAt }
            ?: throw InvalidRequestException(Msg("error.event.series.noDates"), ErrorCode.INVALID_REQUEST)
        // Das Anlegen der Serie zählt in der Statistik einmal, nicht je Termin.
        statisticsRecorder.record(StatisticFeature.EVENT, actor = caller, event = first, sourceId = saved.id)
        eventInvitationService.dispatchDue()
        return eventService.getEvent(first.id, principal)
    }

    // ------------------------------------------------------------------ Bearbeiten

    /**
     * Änderung mit `scope` `following` oder `all`. Antwortet mit dem Termin
     * selbst bzw., falls er nach einer Regeländerung wegfällt, mit dem nächsten
     * Termin der Serie.
     */
    fun update(eventId: UUID, request: UpdateEventRequest, principal: UserPrincipal): EventDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)
        val scope = request.scope ?: SCOPE_THIS
        val status = request.status?.let {
            EventStatus.fromValue(it) ?: throw InvalidRequestException(Msg("error.event.invalidStatus", it), ErrorCode.INVALID_REQUEST)
        }
        if (status != null && status !in SERIES_STATUSES) {
            throw InvalidRequestException(Msg("error.event.series.statusNotAllowed"), ErrorCode.INVALID_REQUEST)
        }

        val current = event.series
        if (current == null) {
            if (request.recurrence == null) {
                throw InvalidRequestException(Msg("error.event.series.notSeries"), ErrorCode.INVALID_REQUEST)
            }
            return convertToSeries(event, request, principal)
        }

        val occurrenceDate = event.seriesDate ?: localDate(event.startsAt, current)
        val hasEarlier = eventRepository.findBySeriesIdOrderBySeriesDateAsc(current.id)
            .any { it.seriesDate != null && it.seriesDate!!.isBefore(occurrenceDate) }
        val cancelled = status == EventStatus.cancelled
        // Absagen ab hier beendet einfach die Serie; geteilt wird nur für Änderungen.
        val target = if (scope == SCOPE_FOLLOWING && hasEarlier && !cancelled) split(current, occurrenceDate) else current
        val from = if (scope == SCOPE_FOLLOWING) occurrenceDate else today(target)

        if (!cancelled) applyTemplateChanges(target, event, occurrenceDate, request, status)
        if (cancelled) {
            endSeries(target, from)
            // Der bearbeitete Termin selbst wird immer sichtbar abgesagt.
            if (event.status != EventStatus.cancelled && !event.startsAt.isBefore(Instant.now())) {
                event.status = EventStatus.cancelled
                event.seriesDetached = true
                eventRepository.save(event)
                eventInvitationService.notifyCancelled(event)
            }
        }
        seriesRepository.save(target)
        reconcile(target, from, applyTemplate = !cancelled)
        eventInvitationService.dispatchDue()

        val stillThere = eventRepository.findById(event.id).orElse(null)
        if (stillThere != null) return eventService.getEvent(stillThere.id, principal)
        val next = eventRepository.findBySeriesIdOrderBySeriesDateAsc(target.id)
            .firstOrNull { !it.startsAt.isBefore(Instant.now()) }
            ?: throw ResourceNotFoundException(Msg("error.event.notFound", event.id), ErrorCode.NOT_FOUND)
        return eventService.getEvent(next.id, principal)
    }

    /** Lädt zu diesem und allen folgenden (auch künftig angelegten) Terminen ein. */
    fun inviteFollowing(eventId: UUID, request: InviteMembersRequest, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)
        val series = event.series
            ?: throw InvalidRequestException(Msg("error.event.series.notSeries"), ErrorCode.INVALID_REQUEST)
        val from = event.seriesDate ?: localDate(event.startsAt, series)
        val users = if (request.allMembers == true) {
            series.inviteAllMembers = true
            seriesRepository.save(series)
            members.activeUsers()
        } else {
            val users = members.requireActiveUsers(request.userIds.orEmpty().map { parseUserId(it) })
            val known = seriesInviteeRepository.findBySeriesId(series.id).mapNotNull { it.user?.id }.toSet()
            users.filter { it.id !in known && it.id != series.owner?.id }
                .forEach { seriesInviteeRepository.save(EventSeriesInviteeEntity(series = series, user = it)) }
            users
        }
        openOccurrences(series, from).forEach { invite(it, users) }
        eventInvitationService.dispatchDue()
    }

    /** Übernimmt Getränke und Speisen dieses Termins in alle folgenden Termine (fehlende kommen dazu). */
    fun copyMenuToFollowing(eventId: UUID, principal: UserPrincipal): Int {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)
        val series = event.series
            ?: throw InvalidRequestException(Msg("error.event.series.notSeries"), ErrorCode.INVALID_REQUEST)
        val from = (event.seriesDate ?: localDate(event.startsAt, series)).plusDays(1)
        val targets = openOccurrences(series, from)
        targets.forEach { copyMenu(event, it) }
        return targets.size
    }

    // ------------------------------------------------------------------ Hintergrundjob

    /** Legt in jeder Gruppe die nächsten Termine aller Serien an. */
    @Scheduled(
        fixedDelayString = "\${vereint.events.series-check-interval:PT6H}",
        initialDelayString = "\${vereint.events.series-check-initial-delay:PT2M}"
    )
    fun extendEverywhere() {
        stammtischJobs.forEachStammtisch("event-series") { tx.execute { extendAll() } }
    }

    /** Legt im aktuellen Stammtisch fehlende Termine aller Serien an. */
    fun extendAll(): Int {
        var created = 0
        for (series in seriesRepository.findAll()) {
            created += reconcile(series, today(series), applyTemplate = false).size
        }
        if (created > 0) eventInvitationService.dispatchDue()
        return created
    }

    // ------------------------------------------------------------------ Kern

    /**
     * Bringt die Termine der Serie ab [from] (frühestens heute) in Einklang mit
     * Regel und Vorlage: fehlende anlegen, wegfallende entfernen und mit
     * [applyTemplate] die nicht einzeln geänderten an die Vorlage anpassen.
     * Liefert die neu angelegten Termine.
     */
    fun reconcile(series: EventSeriesEntity, from: LocalDate, applyTemplate: Boolean): List<EventEntity> {
        val zone = EventSeriesSupport.zone(series)
        val today = LocalDate.now(zone)
        val effectiveFrom = maxOf(from, today)
        val plan = EventSeriesSupport.plan(series)
        val existing = eventRepository.findBySeriesIdOrderBySeriesDateAsc(series.id)
        val horizon = today.plusDays(HORIZON_DAYS)
        val farthest = existing.mapNotNull { it.seriesDate }.maxOrNull()
        val wanted = plan.dates(series.startsOn, maxOf(horizon, farthest ?: horizon))
            .filter { !it.isBefore(effectiveFrom) }
            .toSet()

        for (event in existing) {
            val date = event.seriesDate ?: continue
            if (date.isBefore(effectiveFrom) || event.status in FINAL_STATUSES) continue
            if (event.startsAt.isBefore(Instant.now())) continue
            if (date !in wanted) {
                remove(event)
            } else if (applyTemplate && !event.seriesDetached) {
                applyTemplate(series, event, zone)
                eventRepository.save(event)
            }
        }

        val byDate = existing.mapNotNull { it.seriesDate }.toSet()
        val futureCount = existing.count { e ->
            val d = e.seriesDate
            d != null && !d.isBefore(today) && d in wanted
        }
        val missing = wanted.filter { !it.isAfter(horizon) && it !in byDate }.sorted()
            .take((MAX_AHEAD - futureCount).coerceAtLeast(0))
        if (missing.isEmpty() && !series.inviteAllMembers) return emptyList()

        val inviteUsers = inviteesOf(series)
        val menuSource = existing.lastOrNull { it.seriesDate?.let { d -> d in wanted || d.isBefore(effectiveFrom) } == true && hasMenu(it) }
        val created = missing.mapNotNull { date ->
            val start = RecurrenceExpander.localStart(date, series.startTime, zone).toInstant()
            if (start.isBefore(Instant.now())) return@mapNotNull null
            val event = EventEntity(series = series, seriesDate = date, owner = series.owner)
            applyTemplate(series, event, zone)
            val saved = eventRepository.save(event)
            invite(saved, inviteUsers)
            if (menuSource != null) copyMenu(menuSource, saved)
            saved
        }
        if (series.inviteAllMembers) {
            // Neue Mitglieder kommen auch zu bereits angelegten kommenden Terminen dazu.
            openOccurrences(series, today).filter { e -> created.none { it.id == e.id } }.forEach { invite(it, inviteUsers) }
        }
        return created
    }

    private fun applyTemplate(series: EventSeriesEntity, event: EventEntity, zone: ZoneId) {
        val date = event.seriesDate ?: return
        val start = RecurrenceExpander.localStart(date, series.startTime, zone)
        event.title = series.title
        event.description = series.description
        event.location = series.location
        event.startsAt = start.toInstant()
        event.endsAt = series.durationMinutes?.let { start.toInstant().plus(Duration.ofMinutes(it.toLong())) }
        event.reminderHoursBefore = series.reminderHoursBefore
        event.statisticsEnabled = series.statisticsEnabled
        event.invitationNotifyAt = series.inviteLeadDays?.let {
            RecurrenceExpander.localStart(date.minusDays(it.toLong()), series.startTime, zone).toInstant()
        }
        if (event.status == EventStatus.draft || event.status == EventStatus.published) {
            event.status = series.status
        }
        if (event.owner == null) event.owner = series.owner
    }

    private fun applyTemplateChanges(
        series: EventSeriesEntity,
        event: EventEntity,
        occurrenceDate: LocalDate,
        request: UpdateEventRequest,
        status: EventStatus?
    ) {
        val zone = EventSeriesSupport.zone(series)
        request.title?.let {
            val title = it.trim()
            if (title.isBlank()) throw InvalidRequestException(Msg("error.field.blank", "title"), ErrorCode.INVALID_REQUEST)
            series.title = title
        }
        request.description?.let { series.description = it.trim().ifBlank { null } }
        request.location?.let { series.location = it.trim().ifBlank { null } }
        val newStart = request.startsAt
        if (newStart != null) {
            val local = newStart.atZone(zone)
            series.startTime = local.toLocalTime().withSecond(0).withNano(0)
            val shift = RecurrenceExpander.daysBetween(occurrenceDate, local.toLocalDate())
            if (shift != 0L) series.startsOn = series.startsOn.plusDays(shift)
        }
        val start = newStart ?: event.startsAt
        request.endsAt?.let {
            if (it.isBefore(start)) throw InvalidRequestException(Msg("error.event.endsBeforeStart"), ErrorCode.INVALID_REQUEST)
            series.durationMinutes = Duration.between(start, it).toMinutes().toInt()
        }
        request.reminderHoursBefore?.let { series.reminderHoursBefore = it.takeIf { h -> h > 0 } }
        request.statisticsEnabled?.let { series.statisticsEnabled = it }
        if (status == EventStatus.draft || status == EventStatus.published) series.status = status
        request.recurrence?.let { recurrence ->
            val plan = EventSeriesSupport.plan(recurrence, series.startsOn)
            EventSeriesSupport.store(series, plan)
            series.inviteLeadDays = recurrence.inviteLeadDays
        }
    }

    /** Teilt die Serie: Die alte endet vor [date], ab [date] gilt eine neue Serie mit allen Terminen ab dort. */
    private fun split(series: EventSeriesEntity, date: LocalDate): EventSeriesEntity {
        val plan = EventSeriesSupport.plan(series)
        val rule = plan.rule
        val before = rule?.let { RecurrenceExpander.ruleDates(it, series.startsOn, date.minusDays(1)).size } ?: 0
        val next = EventSeriesEntity(
            owner = series.owner,
            title = series.title,
            description = series.description,
            location = series.location,
            startsOn = date,
            startTime = series.startTime,
            durationMinutes = series.durationMinutes,
            timeZone = series.timeZone,
            status = series.status,
            inviteLeadDays = series.inviteLeadDays,
            reminderHoursBefore = series.reminderHoursBefore,
            statisticsEnabled = series.statisticsEnabled,
            inviteAllMembers = series.inviteAllMembers
        )
        EventSeriesSupport.store(
            next,
            SeriesPlan(
                rule = rule?.copy(count = rule.count?.let { (it - before).coerceAtLeast(1) }),
                extraDates = plan.extraDates.filter { !it.isBefore(date) },
                excludedDates = plan.excludedDates.filter { !it.isBefore(date) }
            )
        )
        val savedNext = seriesRepository.save(next)
        seriesInviteeRepository.findBySeriesId(series.id).forEach {
            seriesInviteeRepository.save(EventSeriesInviteeEntity(series = savedNext, user = it.user))
        }
        endSeries(series, date)
        seriesRepository.save(series)
        eventRepository.findBySeriesIdOrderBySeriesDateAsc(series.id)
            .filter { it.seriesDate != null && !it.seriesDate!!.isBefore(date) }
            .forEach {
                it.series = savedNext
                eventRepository.save(it)
            }
        return savedNext
    }

    /** Die Serie hat ab [from] keine Termine mehr. */
    private fun endSeries(series: EventSeriesEntity, from: LocalDate) {
        val plan = EventSeriesSupport.plan(series)
        val lastDay = from.minusDays(1)
        // UNTIL vor dem Beginn ergibt einfach keine Termine aus der Regel.
        val rule = plan.rule?.let { r -> r.copy(until = r.until?.let { minOf(it, lastDay) } ?: lastDay) }
        val excluded = plan.excludedDates.filter { it.isBefore(from) }.toMutableList()
        // Ohne Regel ist der Beginn selbst ein Termin; er fällt mit weg.
        if (rule == null && !from.isAfter(series.startsOn)) excluded += series.startsOn
        EventSeriesSupport.store(series, SeriesPlan(rule, plan.extraDates.filter { it.isBefore(from) }, excluded))
    }

    private fun convertToSeries(event: EventEntity, request: UpdateEventRequest, principal: UserPrincipal): EventDto {
        val recurrence: RecurrenceRequest = request.recurrence!!
        val zone = EventSeriesSupport.DEFAULT_ZONE
        val start = request.startsAt ?: event.startsAt
        val local = start.atZone(zone)
        val end = request.endsAt ?: event.endsAt
        val series = EventSeriesEntity(
            owner = event.owner,
            title = request.title?.trim()?.ifBlank { null } ?: event.title,
            description = request.description?.trim()?.ifBlank { null } ?: event.description,
            location = request.location?.trim()?.ifBlank { null } ?: event.location,
            startsOn = local.toLocalDate(),
            startTime = local.toLocalTime().withSecond(0).withNano(0),
            durationMinutes = end?.let { Duration.between(start, it).toMinutes().toInt() }?.takeIf { it >= 0 },
            timeZone = zone.id,
            status = if (event.status == EventStatus.draft) EventStatus.draft else EventStatus.published,
            inviteLeadDays = recurrence.inviteLeadDays,
            reminderHoursBefore = request.reminderHoursBefore?.takeIf { it > 0 } ?: event.reminderHoursBefore,
            statisticsEnabled = request.statisticsEnabled ?: event.statisticsEnabled
        )
        val plan = EventSeriesSupport.plan(recurrence, series.startsOn)
        // Das bestehende Event bleibt der erste Termin, auch wenn sein Tag nicht zur Regel passt.
        EventSeriesSupport.store(series, plan.copy(extraDates = (plan.extraDates + series.startsOn).distinct()))
        val saved = seriesRepository.save(series)
        eventParticipantRepository.findByEventId(event.id).mapNotNull { it.user }.forEach {
            seriesInviteeRepository.save(EventSeriesInviteeEntity(series = saved, user = it))
        }
        event.series = saved
        event.seriesDate = saved.startsOn
        event.seriesDetached = false
        eventRepository.save(event)
        reconcile(saved, today(saved), applyTemplate = true)
        eventInvitationService.dispatchDue()
        return eventService.getEvent(event.id, principal)
    }

    private fun remove(event: EventEntity) {
        if (isTouched(event)) {
            if (event.status != EventStatus.cancelled) {
                event.status = EventStatus.cancelled
                event.seriesDetached = true
                eventRepository.save(event)
                eventInvitationService.notifyCancelled(event)
            }
            return
        }
        if (event.status == EventStatus.cancelled && event.seriesDetached) return
        eventParticipantRepository.deleteAll(eventParticipantRepository.findByEventId(event.id))
        eventDrinkRepository.deleteAll(eventDrinkRepository.findByEventId(event.id))
        eventFoodRepository.deleteAll(eventFoodRepository.findByEventId(event.id))
        conversationRepository.deleteAll(conversationRepository.findByEventId(event.id))
        eventRepository.delete(event)
        eventRepository.flush()
    }

    /** Ist an dem Termin schon etwas passiert, das nicht verloren gehen darf? */
    private fun isTouched(event: EventEntity): Boolean =
        eventParticipantRepository.findByEventId(event.id).any { it.rsvp != RsvpStatus.invited } ||
            eventGuestRepository.findByEventId(event.id).isNotEmpty() ||
            conversationRepository.findByEventId(event.id).any { chatMessageRepository.countByConversationId(it.id) > 0 } ||
            ledgerEntryRepository.findByEventId(event.id).isNotEmpty() ||
            roundRepository.findByEventIdOrderByCreatedAtAsc(event.id).isNotEmpty() ||
            momentSessionRepository.findByEventIdOrderByCreatedAtDesc(event.id).isNotEmpty()

    private fun hasMenu(event: EventEntity): Boolean =
        eventDrinkRepository.findByEventId(event.id).isNotEmpty() || eventFoodRepository.findByEventId(event.id).isNotEmpty()

    private fun copyMenu(source: EventEntity, target: EventEntity) {
        val drinks = eventDrinkRepository.findByEventId(target.id).mapNotNull { it.drink?.id }.toSet()
        eventDrinkRepository.findByEventId(source.id).filter { it.drink?.id !in drinks }.forEach {
            eventDrinkRepository.save(
                EventDrinkEntity(
                    event = target,
                    drink = it.drink,
                    price = it.price,
                    costPrice = it.costPrice,
                    currency = it.currency,
                    selfServiceEnabled = it.selfServiceEnabled,
                    tabletEnabled = it.tabletEnabled,
                    catalogVersion = it.catalogVersion,
                    imageSnapshot = it.imageSnapshot
                )
            )
        }
        val food = eventFoodRepository.findByEventId(target.id).mapNotNull { it.food?.id }.toSet()
        eventFoodRepository.findByEventId(source.id).filter { it.food?.id !in food }.forEach {
            eventFoodRepository.save(
                EventFoodEntity(
                    event = target,
                    food = it.food,
                    price = it.price,
                    costPrice = it.costPrice,
                    currency = it.currency,
                    selfServiceEnabled = it.selfServiceEnabled,
                    tabletEnabled = it.tabletEnabled
                )
            )
        }
    }

    /** Kommende Termine ab [from], die noch Einladungen annehmen. */
    private fun openOccurrences(series: EventSeriesEntity, from: LocalDate): List<EventEntity> {
        val now = Instant.now()
        return eventRepository.findBySeriesIdOrderBySeriesDateAsc(series.id).filter {
            val date = it.seriesDate
            date != null && !date.isBefore(from) && !it.startsAt.isBefore(now) &&
                (it.status == EventStatus.draft || it.status == EventStatus.published)
        }
    }

    private fun inviteesOf(series: EventSeriesEntity): List<UserEntity> {
        if (series.inviteAllMembers) return members.activeUsers()
        val active = members.activeUserIds()
        return seriesInviteeRepository.findBySeriesId(series.id).mapNotNull { it.user }.filter { it.id in active && !it.disabled }
    }

    private fun invite(event: EventEntity, users: List<UserEntity>) {
        val existing = eventParticipantRepository.findByEventId(event.id).mapNotNull { it.user?.id }.toSet()
        users.filter { it.id != event.owner?.id && it.id !in existing }
            .forEach {
                eventParticipantRepository.save(
                    EventParticipantEntity(event = event, user = it, role = EventService.PARTICIPANT_ROLE_DEFAULT)
                )
            }
    }

    private fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.event.notFound", id), ErrorCode.NOT_FOUND)
        }

    private fun requireManage(caller: UserEntity, principal: UserPrincipal, event: EventEntity) {
        val allowed = access.has(principal, caller, Permission.EVENT_MANAGE) || event.owner?.id == caller.id
        if (!allowed) throw AccessDeniedException(Msg("error.event.manageDenied"), ErrorCode.ACCESS_DENIED)
    }

    private fun today(series: EventSeriesEntity): LocalDate = LocalDate.now(EventSeriesSupport.zone(series))

    private fun localDate(instant: Instant, series: EventSeriesEntity): LocalDate =
        instant.atZone(EventSeriesSupport.zone(series)).toLocalDate()

    private fun parseUserId(value: String?): UUID = try {
        UUID.fromString(value?.trim().orEmpty())
    } catch (_: IllegalArgumentException) {
        throw InvalidRequestException(Msg("error.field.invalidUuid", "userId", value.orEmpty()), ErrorCode.INVALID_REQUEST)
    }

    private fun required(field: String) =
        InvalidRequestException(Msg("error.field.required", field), ErrorCode.INVALID_REQUEST)

    companion object {
        const val SCOPE_THIS = "this"
        const val SCOPE_FOLLOWING = "following"
        const val SCOPE_ALL = "all"

        /** Termine so weit im Voraus anlegen. */
        const val HORIZON_DAYS = 365L

        /** Höchstens so viele kommende Termine je Serie (z. B. ein halbes Jahr wöchentlich). */
        const val MAX_AHEAD = 26

        private const val PREVIEW_YEARS = 5L

        private val SERIES_STATUSES = setOf(EventStatus.draft, EventStatus.published, EventStatus.cancelled)
        private val FINAL_STATUSES = setOf(EventStatus.active, EventStatus.completed, EventStatus.archived)
    }
}
