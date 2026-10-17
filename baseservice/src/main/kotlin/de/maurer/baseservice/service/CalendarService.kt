package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.dto.CalendarDto
import de.maurer.baseservice.dto.CalendarEntryDto
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.MomentSessionRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.MembershipView
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.StammtischMemberships
import de.maurer.baseservice.tenancy.TenantTransactions
import org.springframework.stereotype.Service
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Persönlicher Kalender über alle eigenen Gruppen.
 *
 * Events und Moments bleiben Teil ihrer Gruppe. Der Kalender liest sie nur:
 * je Gruppe, in der die Person aktives Mitglied ist, in einer eigenen
 * Transaktion im Kontext genau dieser Gruppe (Hibernate-Filter und
 * Row-Level-Security greifen wie bei jeder anderen Anfrage). Sichtbar ist
 * dasselbe wie auf der Event-Seite der Gruppe: eigene Events, Einladungen und
 * mit `event.manage` alle Events der Gruppe; Entwürfe nur die eigenen. Dazu
 * kommen die Moments dieser Events. Jeder Eintrag nennt seine Gruppe.
 */
@Service
class CalendarService(
    private val userService: UserService,
    private val userRepository: UserRepository,
    private val memberships: StammtischMemberships,
    private val tenantTransactions: TenantTransactions,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val momentSessionRepository: MomentSessionRepository,
    private val momentConfigService: MomentConfigService,
    private val access: StammtischAccess
) {

    fun calendar(from: Instant?, to: Instant?, principal: UserPrincipal): CalendarDto {
        val caller = userService.getOrCreateUser(principal)
        val start = from ?: Instant.now().minus(DEFAULT_PAST)
        val end = to ?: Instant.now().plus(DEFAULT_FUTURE)
        if (!end.isAfter(start)) {
            throw InvalidRequestException(Msg("error.calendar.invalidRange"), ErrorCode.INVALID_REQUEST)
        }
        if (Duration.between(start, end) > MAX_RANGE) {
            throw InvalidRequestException(Msg("error.calendar.rangeTooLong", MAX_RANGE.toDays()), ErrorCode.INVALID_REQUEST)
        }
        val entries = memberships.memberships(caller.id).flatMap { membership ->
            tenantTransactions.readInStammtisch(membership.stammtischId) {
                entriesIn(membership, principal, caller.id, start, end)
            }
        }
        return CalendarDto(
            from = start,
            to = end,
            entries = entries.sortedWith(compareBy<CalendarEntryDto> { it.startsAt }.thenBy { it.title.lowercase() })
        )
    }

    /** Läuft im Kontext der Gruppe [membership]. */
    private fun entriesIn(
        membership: MembershipView,
        principal: UserPrincipal,
        callerId: UUID,
        start: Instant,
        end: Instant
    ): List<CalendarEntryDto> {
        val caller = userRepository.findById(callerId).orElseThrow()
        // Rechte dieser Gruppe statt der gerade gewählten (wie nach dem StammtischContextFilter).
        val groupPrincipal = principal.copy(
            roles = membership.roles,
            permissions = membership.permissions,
            boardRole = membership.boardRole,
            stammtischId = membership.stammtischId.toString()
        )
        val participations = eventParticipantRepository.findByUserId(caller.id)
        val myRsvp = participations.associate { it.event?.id to it.rsvp.name }
        val visible: Collection<EventEntity> = if (access.has(groupPrincipal, caller, Permission.EVENT_MANAGE)) {
            eventRepository.findAll()
        } else {
            (eventRepository.findByOwnerId(caller.id) + participations.mapNotNull { it.event }).associateBy { it.id }.values
        }.filter { it.status != EventStatus.draft || it.owner?.id == caller.id }

        val groupId = membership.stammtischId.toString()
        val events = visible
            .filter { overlaps(it.startsAt, it.endsAt, start, end) }
            .map { event ->
                CalendarEntryDto(
                    kind = KIND_EVENT,
                    id = event.id.toString(),
                    eventId = event.id.toString(),
                    title = event.title,
                    startsAt = event.startsAt,
                    endsAt = event.endsAt,
                    location = event.location,
                    status = event.status.name,
                    myRsvp = myRsvp[event.id],
                    emoji = null,
                    topicName = null,
                    active = false,
                    stammtischId = groupId,
                    stammtischName = membership.stammtischName
                )
            }

        val byId = visible.associateBy { it.id }
        val labels = momentConfigService.labels()
        val now = Instant.now()
        val moments = if (byId.isEmpty()) emptyList() else momentSessionRepository.findByEventIdIn(byId.keys)
            .filter { !it.createdAt.isBefore(start) && it.createdAt.isBefore(end) }
            .mapNotNull { session ->
                val event = byId[session.event?.id] ?: return@mapNotNull null
                CalendarEntryDto(
                    kind = KIND_MOMENT,
                    id = session.id.toString(),
                    eventId = event.id.toString(),
                    title = session.title,
                    startsAt = session.createdAt,
                    endsAt = session.completedAt ?: session.expiresAt,
                    location = event.title,
                    status = event.status.name,
                    myRsvp = null,
                    emoji = labels.typeEmoji(session.topicType),
                    topicName = labels.typeName(session.topicType),
                    active = session.active && session.expiresAt.isAfter(now),
                    stammtischId = groupId,
                    stammtischName = membership.stammtischName
                )
            }
        return events + moments
    }

    private fun overlaps(startsAt: Instant, endsAt: Instant?, from: Instant, to: Instant): Boolean {
        val eventEnd = endsAt ?: startsAt
        return startsAt.isBefore(to) && !eventEnd.isBefore(from)
    }

    companion object {
        const val KIND_EVENT = "event"
        const val KIND_MOMENT = "moment"
        private val DEFAULT_PAST: Duration = Duration.ofDays(31)
        private val DEFAULT_FUTURE: Duration = Duration.ofDays(62)

        /** Größter abfragbarer Zeitraum je Anfrage. */
        val MAX_RANGE: Duration = Duration.ofDays(400)
    }
}
