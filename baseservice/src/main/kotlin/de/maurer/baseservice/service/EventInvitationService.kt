package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.error.Messages
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.repository.EventParticipantRepository
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Verschickt Einladungen und Erinnerungen zu Events als Mitteilung samt Web Push.
 *
 * - Einladung: sobald das Event veröffentlicht (bzw. aktiv) ist und der im Event
 *   eingestellte Zeitpunkt (`invitation_notify_at`) erreicht ist; ohne Zeitpunkt
 *   sofort. Jede Person bekommt sie genau einmal.
 * - Erinnerung: `reminder_hours_before` Stunden vor Beginn an alle, die nicht
 *   abgesagt haben. Ist dieser Zeitpunkt bei der Einladung schon vorbei, entfällt
 *   die Erinnerung.
 *
 * Läuft regelmäßig im Hintergrund und zusätzlich direkt nach Änderungen am Event,
 * damit „sofort“ auch sofort heißt. Beide Wege sind idempotent über die
 * Versandzeitpunkte am Teilnehmer.
 */
@Service
class EventInvitationService(
    private val eventParticipantRepository: EventParticipantRepository,
    private val notificationService: NotificationService
) {

    @Scheduled(
        fixedDelayString = "\${vereint.events.invitation-check-interval:PT1M}",
        initialDelayString = "\${vereint.events.invitation-check-initial-delay:PT30S}"
    )
    @Transactional
    fun dispatchDue(): Int {
        val now = Instant.now()
        var sent = 0
        for (participant in eventParticipantRepository.findDueInvitations(OPEN_STATUSES, now)) {
            sendInvitation(participant, now)
            sent++
        }
        for (participant in eventParticipantRepository.findReminderCandidates(OPEN_STATUSES, RsvpStatus.declined, now)) {
            val event = participant.event ?: continue
            if (participant.invitationSentAt == null) continue
            if (now.isBefore(reminderTime(event) ?: continue)) continue
            sendReminder(participant, now)
            sent++
        }
        return sent
    }

    /** Teilt Zugesagten und Unentschlossenen mit, dass das Event abgesagt wurde. */
    @Transactional
    fun notifyCancelled(event: EventEntity) {
        val recipients = eventParticipantRepository.findByEventId(event.id)
            .filter { it.invitationSentAt != null && it.rsvp != RsvpStatus.declined }
            .mapNotNull { it.user }
            .filter { !it.disabled }
        if (recipients.isEmpty()) return
        notificationService.notifyUsers(
            recipients,
            text(Msg("notification.event.cancelled.title", event.title)),
            text(Msg("notification.event.cancelled.body", event.title, formatStart(event))),
            TYPE_CANCELLED,
            link(event)
        )
    }

    private fun sendInvitation(participant: EventParticipantEntity, now: Instant) {
        val event = participant.event ?: return
        val user = participant.user ?: return
        val where = event.location?.let { text(Msg("notification.event.location", it)) }.orEmpty()
        notificationService.notifyUser(
            user,
            text(Msg("notification.event.invitation.title", event.title)),
            text(Msg("notification.event.invitation.body", event.owner?.displayName.orEmpty(), formatStart(event), where)),
            TYPE_INVITATION,
            link(event)
        )
        participant.invitationSentAt = now
        val reminderAt = reminderTime(event)
        if (reminderAt != null && !now.isBefore(reminderAt)) {
            participant.reminderSentAt = now
        }
    }

    private fun sendReminder(participant: EventParticipantEntity, now: Instant) {
        val event = participant.event ?: return
        val user = participant.user ?: return
        val key = if (participant.rsvp == RsvpStatus.accepted) {
            "notification.event.reminder.bodyAccepted"
        } else {
            "notification.event.reminder.bodyOpen"
        }
        notificationService.notifyUser(
            user,
            text(Msg("notification.event.reminder.title", event.title)),
            text(Msg(key, formatStart(event))),
            TYPE_REMINDER,
            link(event)
        )
        participant.reminderSentAt = now
    }

    private fun reminderTime(event: EventEntity): Instant? =
        event.reminderHoursBefore?.let { event.startsAt.minus(Duration.ofHours(it.toLong())) }

    private fun text(msg: Msg): String = Messages.defaultText(msg).trim()

    private fun formatStart(event: EventEntity): String = START_FORMAT.format(event.startsAt)

    private fun link(event: EventEntity): String = "/events/${event.id}"

    companion object {
        const val TYPE_INVITATION = "event_invitation"
        const val TYPE_REMINDER = "event_reminder"
        const val TYPE_CANCELLED = "event_cancelled"
        val OPEN_STATUSES = listOf(EventStatus.published, EventStatus.active)

        /** Vereinszeit; Mitteilungen werden in der Standardsprache gespeichert. */
        private val START_FORMAT: DateTimeFormatter = DateTimeFormatter
            .ofPattern("EEEE, d. MMMM yyyy 'um' HH:mm 'Uhr'", Locale.GERMAN)
            .withZone(ZoneId.of("Europe/Berlin"))
    }
}
