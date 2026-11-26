package de.maurer.baseservice.service

import de.maurer.baseservice.domain.ChatMessageEntity
import de.maurer.baseservice.domain.ConversationEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.ChatMessageRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import org.springframework.stereotype.Component
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Zu- und Absagen im Event-Chat.
 *
 * - Sagt jemand zu oder ab, steht im Chat eine Hinweiszeile (grün bzw. rot),
 *   als Nachricht mit [ChatMessageEntity.kind]. Sie löst keinen Push aus und
 *   zählt nicht als ungelesen, kommt aber live in offene Chats.
 * - An Nachrichten steht die Antwort der Absenderin auf den Termin, für den
 *   sie geschrieben wurde (bei Serien der nächste Termin zu dem Zeitpunkt),
 *   solange es eine Zu- oder Absage gibt und der Termin nicht vorbei ist.
 */
@Component
class ChatRsvpNotes(
    private val chatService: ChatService,
    private val chatMessageRepository: ChatMessageRepository,
    private val chatNotifier: ChatNotifier,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository
) {

    /** Nach einer Antwort: Hinweis bei neuer Zu- oder Absage, sonst nur die Anzeige auffrischen. */
    fun rsvpChanged(event: EventEntity, user: UserEntity, previous: RsvpStatus, status: RsvpStatus) {
        if (event.status == EventStatus.draft) return
        val conversation = chatService.requireEventConversation(event)
        val kind = when (status) {
            RsvpStatus.accepted -> KIND_ACCEPTED
            RsvpStatus.declined -> KIND_DECLINED
            else -> null
        }
        if (kind != null && status != previous) {
            chatMessageRepository.save(
                ChatMessageEntity(conversation = conversation, sender = user, message = "", kind = kind, rsvpEvent = event)
            )
        }
        chatNotifier.changed(conversation)
    }

    /** Antwort je Nachricht (`accepted`/`declined`) für die Anzeige unter der Nachricht. */
    fun badges(conversation: ConversationEntity, messages: List<ChatMessageEntity>, now: Instant = Instant.now()): Map<UUID, String> {
        if (conversation.type != ChatService.CONVERSATION_TYPE_EVENT) return emptyMap()
        val written = messages.filter { it.kind == null && it.sender != null }
        if (written.isEmpty()) return emptyMap()
        val events = (conversation.series?.let { eventRepository.findByChatRoot(it.id) } ?: listOfNotNull(conversation.event))
            .filter { it.status != EventStatus.cancelled }
            .sortedBy { it.startsAt }
        val running = events.filter { !isOver(it, now) }
        if (running.isEmpty()) return emptyMap()
        val answers = running.associate { event ->
            event.id to eventParticipantRepository.findByEventId(event.id)
                .filter { it.rsvp == RsvpStatus.accepted || it.rsvp == RsvpStatus.declined }
                .mapNotNull { p -> p.user?.id?.let { it to p.rsvp.name } }
                .toMap()
        }
        val result = mutableMapOf<UUID, String>()
        for (message in written) {
            // Termin, für den geschrieben wurde: der erste, der beim Schreiben noch nicht vorbei war.
            val target = events.firstOrNull { !endOf(it).isBefore(message.createdAt) } ?: continue
            val answer = answers[target.id]?.get(message.sender!!.id) ?: continue
            result[message.id] = answer
        }
        return result
    }

    private fun endOf(event: EventEntity): Instant = event.endsAt ?: event.startsAt.plus(OPEN_END)

    private fun isOver(event: EventEntity, now: Instant): Boolean =
        event.status == EventStatus.completed || event.status == EventStatus.archived || endOf(event).isBefore(now)

    companion object {
        const val KIND_ACCEPTED = "rsvp_accepted"
        const val KIND_DECLINED = "rsvp_declined"

        /** Ohne Ende gilt ein Termin bis sechs Stunden nach Beginn (wie in der Eventliste). */
        private val OPEN_END: Duration = Duration.ofHours(6)
    }
}
