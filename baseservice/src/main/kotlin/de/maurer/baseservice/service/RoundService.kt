package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventDrinkEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.domain.RoundEntity
import de.maurer.baseservice.domain.RoundInviteeEntity
import de.maurer.baseservice.domain.RoundKind
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateRoundRequest
import de.maurer.baseservice.dto.RoundDrinkOptionDto
import de.maurer.baseservice.dto.RoundDto
import de.maurer.baseservice.dto.RoundFundingDto
import de.maurer.baseservice.dto.RoundInviteeDto
import de.maurer.baseservice.dto.RoundMemberOptionDto
import de.maurer.baseservice.dto.RoundOptionsDto
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Messages
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.EventDrinkRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.RoundInviteeRepository
import de.maurer.baseservice.repository.RoundRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.support.Identifiers
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.StammtischMembers
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Runden am eigenen Handy (Issue #81).
 *
 * Eine Person, die zum laufenden Event gehört, gibt mit dem eigenen Guthaben
 * eine Runde (ein Getränk je eingeladener Person) oder den ganzen Abend (bis
 * zur Höchstsumme) aus. Abgebucht wird nichts beim Start: Bucht das
 * Thekenterminal einen Strich für eine eingeladene Person, prüft
 * [claimFor], ob eine laufende Runde greift, und die Buchung geht dann auf den
 * Geber (siehe [LedgerService.recordTabletPurchase]). Das Guthaben des Gebers
 * darf dabei wie bei der Barcode-Zahlung ins Minus gehen.
 *
 * Verbrauch, Einlösungen und Stand werden aus den Buchungen mit `round_id`
 * berechnet; ein zurückgenommener Strich gibt Betrag und Platz wieder frei.
 * Ist eine Person in mehreren Runden eingeladen, gilt die zuerst gestartete.
 */
@Service
@Transactional
class RoundService(
    private val roundRepository: RoundRepository,
    private val roundInviteeRepository: RoundInviteeRepository,
    private val eventRepository: EventRepository,
    private val eventDrinkRepository: EventDrinkRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val ledgerService: LedgerService,
    private val notificationService: NotificationService,
    private val userService: UserService,
    private val access: StammtischAccess,
    private val members: StammtischMembers
) {

    fun create(eventId: UUID, request: CreateRoundRequest, principal: UserPrincipal, now: Instant = Instant.now()): RoundDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        if (!belongsToEvent(caller, principal, event)) {
            throw AccessDeniedException(Msg("error.round.notInEvent"), ErrorCode.ACCESS_DENIED)
        }
        requireActive(event)

        val kind = RoundKind.fromValue(request.kind?.trim())
            ?: throw InvalidRequestException(Msg("error.round.kindInvalid", request.kind.orEmpty()), ErrorCode.INVALID_REQUEST)
        val eventDrink = request.eventDrinkId?.trim()?.takeIf { it.isNotEmpty() }?.let {
            requireEventDrink(event, Identifiers.parseUuid(it, "eventDrinkId"))
        }
        val validUntil = when (request.validity?.trim()) {
            VALIDITY_30_MIN -> now.plus(Duration.ofMinutes(30))
            VALIDITY_1_HOUR -> now.plus(Duration.ofHours(1))
            VALIDITY_EVENT_END -> null
            else -> throw InvalidRequestException(
                Msg("error.round.validityInvalid", request.validity.orEmpty()),
                ErrorCode.INVALID_REQUEST
            )
        }
        val invitees = requireInvitees(event, request.memberIds.orEmpty())

        val drinks = tabletDrinks(event.id)
        val (maxAmount, currency) = when (kind) {
            RoundKind.round -> {
                val unit = eventDrink?.let { EventDrinkPricing.resolve(it) }
                    ?: drinks.map { EventDrinkPricing.resolve(it) }.maxByOrNull { it.unitPrice }
                    ?: throw InvalidRequestException(Msg("error.round.noDrinks"), ErrorCode.INVALID_REQUEST)
                unit.unitPrice.multiply(BigDecimal(invitees.size)).setScale(2) to unit.currency
            }
            RoundKind.evening -> {
                val amount = request.maxAmount
                    ?: throw InvalidRequestException(Msg("error.field.required", "maxAmount"), ErrorCode.INVALID_REQUEST)
                if (amount.signum() <= 0) {
                    throw InvalidRequestException(Msg("error.field.negative", "maxAmount"), ErrorCode.INVALID_REQUEST)
                }
                val currency = eventDrink?.let { EventDrinkPricing.resolve(it).currency }
                    ?: drinks.firstOrNull()?.let { EventDrinkPricing.resolve(it).currency }
                    ?: DEFAULT_CURRENCY
                amount.setScale(2, java.math.RoundingMode.HALF_UP) to currency
            }
        }

        val round = roundRepository.save(
            RoundEntity(
                event = event,
                sponsor = caller,
                kind = kind,
                eventDrink = eventDrink,
                maxAmount = maxAmount,
                currency = currency,
                validUntil = validUntil
            )
        )
        val saved = invitees.map { roundInviteeRepository.save(RoundInviteeEntity(round = round, member = it)) }
        notifyInvitees(round, invitees.filter { it.id != caller.id })
        return toDto(round, saved, emptyList(), now)
    }

    @Transactional(readOnly = true)
    fun list(eventId: UUID, principal: UserPrincipal, now: Instant = Instant.now()): List<RoundDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        if (!belongsToEvent(caller, principal, event) && !access.has(principal, caller, Permission.PURCHASE_TABLET)) {
            throw AccessDeniedException(Msg("error.round.viewDenied"), ErrorCode.ACCESS_DENIED)
        }
        return roundsOf(event.id, now)
    }

    /** Beendet eine eigene Runde vorzeitig (Geber oder Event-Verwaltung). */
    fun end(eventId: UUID, roundId: UUID, principal: UserPrincipal, now: Instant = Instant.now()): RoundDto {
        val caller = userService.getOrCreateUser(principal)
        val round = roundRepository.findByIdForUpdate(roundId)
            .filter { it.event?.id == eventId }
            .orElseThrow { ResourceNotFoundException(Msg("error.round.notFound", roundId), ErrorCode.NOT_FOUND) }
        if (round.sponsor?.id != caller.id && !access.has(principal, caller, Permission.EVENT_MANAGE)) {
            throw AccessDeniedException(Msg("error.round.endDenied"), ErrorCode.ACCESS_DENIED)
        }
        if (round.endedAt == null) {
            round.endedAt = now
            roundRepository.save(round)
        }
        return roundsOf(eventId, now).single { it.id == round.id.toString() }
    }

    /** Alles für das Formular „Runde ausgeben“: Guthaben, Getränke mit Preis, Personen. */
    @Transactional(readOnly = true)
    fun options(eventId: UUID, principal: UserPrincipal): RoundOptionsDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        if (!belongsToEvent(caller, principal, event)) {
            throw AccessDeniedException(Msg("error.round.notInEvent"), ErrorCode.ACCESS_DENIED)
        }
        requireActive(event)
        val balance = ledgerService.getMemberBalance(caller.id, principal)
        val drinks = tabletDrinks(event.id).map {
            val pricing = EventDrinkPricing.resolve(it)
            RoundDrinkOptionDto(
                eventDrinkId = it.id.toString(),
                drinkName = it.drink?.name.orEmpty(),
                price = pricing.unitPrice,
                currency = pricing.currency
            )
        }
        val present = presentMembers(event.id)
        val people = eventPeople(event)
            .filter { (user, _) -> user.id != caller.id }
            .map { (user, accepted) ->
                RoundMemberOptionDto(
                    memberId = user.id.toString(),
                    displayName = user.displayName,
                    accepted = accepted,
                    present = user.id in present
                )
            }
            .sortedBy { it.displayName.lowercase() }
        return RoundOptionsDto(
            eventId = event.id.toString(),
            eventTitle = event.title,
            creditBalance = balance.creditBalance,
            currency = balance.currency,
            drinks = drinks,
            members = people
        )
    }

    /**
     * Sucht die Runde, auf die ein Strich für [member] geht, und sperrt sie für
     * die laufende Transaktion (`SELECT … FOR UPDATE`), damit parallele Striche
     * Höchstsumme und „ein Getränk je Person“ nicht überholen. Älteste Runde
     * zuerst; `null` = eigene Rechnung.
     */
    fun claimFor(event: EventEntity, member: UserEntity, eventDrink: EventDrinkEntity, now: Instant = Instant.now()): RoundEntity? {
        val price = EventDrinkPricing.resolve(eventDrink).unitPrice
        val candidates = roundRepository.findByEventIdOrderByCreatedAtAsc(event.id).filter { it.isRunning(now) }
        if (candidates.isEmpty()) return null
        val invitedIn = roundInviteeRepository.findByRoundIdIn(candidates.map { it.id })
            .filter { it.member?.id == member.id }
            .mapNotNull { it.round?.id }
            .toSet()
        for (candidate in candidates.filter { it.id in invitedIn }) {
            val round = roundRepository.findByIdForUpdate(candidate.id).orElse(null) ?: continue
            if (!round.isRunning(now) || !matchesDrink(round, eventDrink)) continue
            val active = activeEntries(ledgerEntryRepository.findByRoundIdIn(listOf(round.id)))
            if (round.kind == RoundKind.round && active.any { it.beneficiary?.id == member.id }) continue
            val used = active.fold(BigDecimal.ZERO) { acc, entry -> acc + entry.amount }
            if (used + price > round.maxAmount) continue
            return round
        }
        return null
    }

    /** Laufende Runden eines Events und wer gerade auf wessen Kosten trinkt (Strichliste). */
    @Transactional(readOnly = true)
    fun boardView(eventId: UUID, now: Instant = Instant.now()): Pair<List<RoundDto>, Map<String, RoundFundingDto>> {
        val rounds = roundsOf(eventId, now).filter { it.status == STATUS_RUNNING }
        val funding = mutableMapOf<String, RoundFundingDto>()
        rounds.forEach { round ->
            val remaining = round.maxAmount - round.usedAmount
            round.invitees
                .filter { round.kind == RoundKind.evening.name || !it.redeemed }
                .filter { remaining.signum() > 0 }
                .forEach { funding.putIfAbsent(it.memberId, RoundFundingDto(round.id, round.sponsorName, round.kind)) }
        }
        return rounds to funding
    }

    // --- Interne Helfer ---

    private fun roundsOf(eventId: UUID, now: Instant): List<RoundDto> {
        val rounds = roundRepository.findByEventIdOrderByCreatedAtAsc(eventId)
        if (rounds.isEmpty()) return emptyList()
        val ids = rounds.map { it.id }
        val invitees = roundInviteeRepository.findByRoundIdIn(ids).groupBy { it.round?.id }
        val entries = ledgerEntryRepository.findByRoundIdIn(ids).groupBy { it.round?.id }
        return rounds.map { toDto(it, invitees[it.id].orEmpty(), entries[it.id].orEmpty(), now) }
    }

    /** Käufe auf die Runde ohne die zurückgenommenen. */
    private fun activeEntries(entries: List<LedgerEntryEntity>): List<LedgerEntryEntity> {
        val reversed = entries.mapNotNull { it.reversesEntry?.id }.toSet()
        return entries.filter { it.entryType == LedgerEntryType.purchase && it.id !in reversed }
    }

    /** Runde auf ein Getränk greift für dieses Getränk und für Getränke derselben Strich-Kategorie. */
    private fun matchesDrink(round: RoundEntity, eventDrink: EventDrinkEntity): Boolean {
        val target = round.eventDrink ?: return true
        if (target.id == eventDrink.id) return true
        val category = EventDrinkPricing.activeCategory(target) ?: return false
        return EventDrinkPricing.activeCategory(eventDrink)?.id == category.id
    }

    private fun toDto(
        round: RoundEntity,
        invitees: List<RoundInviteeEntity>,
        entries: List<LedgerEntryEntity>,
        now: Instant
    ): RoundDto {
        val active = activeEntries(entries)
        val used = active.fold(BigDecimal.ZERO) { acc, entry -> acc + entry.amount }.setScale(2)
        val redeemed = active.groupingBy { it.beneficiary?.id }.eachCount()
        val people = invitees.mapNotNull { it.member }
            .map {
                val count = redeemed[it.id] ?: 0
                RoundInviteeDto(memberId = it.id.toString(), displayName = it.displayName, redeemedCount = count, redeemed = count > 0)
            }
            .sortedBy { it.displayName.lowercase() }
        val usedUp = used >= round.maxAmount ||
            (round.kind == RoundKind.round && people.isNotEmpty() && people.all { it.redeemed })
        val status = when {
            round.endedAt != null -> STATUS_ENDED
            !round.isRunning(now) -> STATUS_EXPIRED
            usedUp -> STATUS_USED_UP
            else -> STATUS_RUNNING
        }
        return RoundDto(
            id = round.id.toString(),
            eventId = round.event?.id?.toString().orEmpty(),
            sponsorId = round.sponsor?.id?.toString().orEmpty(),
            sponsorName = round.sponsor?.displayName.orEmpty(),
            kind = round.kind.name,
            eventDrinkId = round.eventDrink?.id?.toString(),
            drinkName = round.eventDrink?.drink?.name,
            maxAmount = round.maxAmount.setScale(2),
            usedAmount = used,
            currency = round.currency,
            validUntil = round.validUntil,
            endedAt = round.endedAt,
            status = status,
            createdAt = round.createdAt,
            invitees = people
        )
    }

    private fun notifyInvitees(round: RoundEntity, targets: List<UserEntity>) {
        if (targets.isEmpty()) return
        val sponsor = round.sponsor?.displayName.orEmpty()
        val event = round.event ?: return
        val title = text(Msg(if (round.kind == RoundKind.evening) "notification.round.title.evening" else "notification.round.title.round", sponsor))
        val drinkName = round.eventDrink?.drink?.name
        val body = if (drinkName != null) {
            text(Msg("notification.round.body.drink", event.title, drinkName, sponsor))
        } else {
            text(Msg("notification.round.body.all", event.title, sponsor))
        }
        notificationService.notifyUsers(targets, title, body, NOTIFICATION_TYPE, "/events/${event.id}")
    }

    private fun text(msg: Msg): String = Messages.defaultText(msg).trim()

    /** Owner und Teilnehmende des Events mit „hat zugesagt“. */
    private fun eventPeople(event: EventEntity): List<Pair<UserEntity, Boolean>> {
        val active = members.activeUserIds()
        val participants = eventParticipantRepository.findByEventId(event.id)
            .mapNotNull { p -> p.user?.let { it to (p.rsvp == RsvpStatus.accepted) } }
        val owner = event.owner?.let { listOf(it to true) }.orEmpty()
        return (owner + participants)
            .filter { (user, _) -> !user.disabled && user.id in active }
            .distinctBy { (user, _) -> user.id }
    }

    /** Wer in diesem Event schon einen Strich oder Kauf hatte (nicht zurückgenommen). */
    private fun presentMembers(eventId: UUID): Set<UUID> {
        val entries = ledgerEntryRepository.findByEventId(eventId)
        return activeEntries(entries).mapNotNull { (it.beneficiary ?: it.member)?.id }.toSet()
    }

    private fun requireInvitees(event: EventEntity, rawIds: List<String>): List<UserEntity> {
        val ids = rawIds.map { Identifiers.parseUuid(it, "memberIds") }.distinct()
        if (ids.isEmpty()) {
            throw InvalidRequestException(Msg("error.round.inviteesRequired"), ErrorCode.INVALID_REQUEST)
        }
        val people = eventPeople(event).associate { (user, _) -> user.id to user }
        return ids.map {
            people[it] ?: throw InvalidRequestException(Msg("error.round.inviteeNotInEvent"), ErrorCode.INVALID_REQUEST)
        }
    }

    private fun tabletDrinks(eventId: UUID): List<EventDrinkEntity> =
        eventDrinkRepository.findByEventId(eventId).filter { it.tabletEnabled && it.drink != null }

    private fun requireEventDrink(event: EventEntity, id: UUID): EventDrinkEntity {
        val eventDrink = eventDrinkRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.eventDrink.notFound", id), ErrorCode.NOT_FOUND)
        }
        if (eventDrink.event?.id != event.id || eventDrink.drink == null) {
            throw ResourceNotFoundException(Msg("error.eventDrink.notInEvent", id), ErrorCode.NOT_FOUND)
        }
        if (!eventDrink.tabletEnabled) {
            throw InvalidRequestException(Msg("error.tablet.drinkDisabled"), ErrorCode.INVALID_REQUEST)
        }
        return eventDrink
    }

    private fun belongsToEvent(caller: UserEntity, principal: UserPrincipal, event: EventEntity): Boolean =
        access.has(principal, caller, Permission.EVENT_MANAGE) ||
            event.owner?.id == caller.id ||
            eventParticipantRepository.findByEventIdAndUserId(event.id, caller.id).isPresent

    private fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.event.notFound", id), ErrorCode.NOT_FOUND)
        }

    private fun requireActive(event: EventEntity) {
        if (event.status != EventStatus.active) {
            throw EventNotActiveException(Msg("error.round.eventNotActive"), ErrorCode.EVENT_NOT_ACTIVE)
        }
    }

    companion object {
        const val VALIDITY_30_MIN = "30m"
        const val VALIDITY_1_HOUR = "1h"
        const val VALIDITY_EVENT_END = "eventEnd"
        const val STATUS_RUNNING = "running"
        const val STATUS_USED_UP = "usedUp"
        const val STATUS_EXPIRED = "expired"
        const val STATUS_ENDED = "ended"
        const val NOTIFICATION_TYPE = "round"
        const val DEFAULT_CURRENCY = "EUR"
    }
}
