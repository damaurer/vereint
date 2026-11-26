package de.maurer.baseservice.service

import de.maurer.baseservice.domain.ConversationEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventSeriesEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import org.springframework.stereotype.Component
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Ein Chat für alle Termine einer Serie.
 *
 * Termine einer Serie teilen sich einen Event-Chat ([ConversationEntity.series]),
 * auch über eine Teilung der Serie hinweg ([EventSeriesEntity.chatRootId]). Wer
 * zu irgendeinem Termin eingeladen ist oder einen Termin ausrichtet, liest und
 * schreibt dort. Für Statistik, Titel und Link steht der Chat für den aktuellen
 * Termin: der laufende, sonst der nächste, sonst der zuletzt vergangene.
 */
@Component
class SeriesChats(
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository
) {

    /** Serie, deren Chat [series] führt. */
    fun rootOf(series: EventSeriesEntity): UUID = series.chatRootId ?: series.id

    /** Schlüssel (`direct_key`) des Chats, in den Nachrichten zu [event] gehören. */
    fun keyFor(event: EventEntity): String =
        event.series?.let { seriesKey(rootOf(it)) } ?: ChatService.eventConversationKey(event.id)

    /** Event, für das der Chat steht: das eigene Event bzw. bei Serien der aktuelle Termin. */
    fun eventOf(conversation: ConversationEntity, now: Instant = Instant.now()): EventEntity? =
        conversation.event ?: conversation.series?.let { current(it.id, now) }

    /** Aktueller Termin aller Termine zu [rootId]. */
    fun current(rootId: UUID, now: Instant = Instant.now()): EventEntity? =
        eventRepository.findByChatRoot(rootId).minWithOrNull(currentFirst(now))

    /**
     * Ob der Chat neue Nachrichten annimmt: Event-Chats, solange das Event nicht
     * abgesagt oder archiviert ist, Serienchats, solange es noch einen solchen
     * Termin gibt.
     */
    fun isOpen(conversation: ConversationEntity): Boolean {
        val series = conversation.series
        if (series != null) return eventRepository.findByChatRoot(series.id).any { isOpen(it) }
        return conversation.event?.let { isOpen(it) } ?: true
    }

    /** Owner und Eingeladene (Einladung verschickt) aller Termine. */
    fun audience(rootId: UUID): Set<UUID> {
        val invited = eventParticipantRepository.findByChatRoot(rootId)
            .filter { it.invitationSentAt != null }
            .mapNotNull { it.user }
            .filter { !it.disabled }
            .map { it.id }
        val owners = eventRepository.findByChatRoot(rootId)
            .mapNotNull { it.owner }
            .filter { !it.disabled }
            .map { it.id }
        return (invited + owners).toSet()
    }

    /** Ob [caller] einen Termin ausrichtet oder zu einem eingeladen ist. */
    fun canAccess(caller: UserEntity, rootId: UUID): Boolean =
        eventRepository.findByChatRoot(rootId).any { it.owner?.id == caller.id } ||
            eventParticipantRepository.findByChatRoot(rootId).any { it.user?.id == caller.id }

    private fun isOpen(event: EventEntity): Boolean =
        event.status != EventStatus.cancelled && event.status != EventStatus.archived

    private fun currentFirst(now: Instant): Comparator<EventEntity> {
        fun past(event: EventEntity): Boolean {
            if (event.status == EventStatus.completed || event.status == EventStatus.archived) return true
            val end = event.endsAt ?: event.startsAt.plus(OPEN_END)
            return end.isBefore(now)
        }
        fun rank(event: EventEntity): Int = when {
            event.status == EventStatus.active -> 0
            event.status == EventStatus.cancelled -> 3
            !past(event) -> 1
            else -> 2
        }
        return Comparator { a, b ->
            val ra = rank(a)
            val rb = rank(b)
            when {
                ra != rb -> ra.compareTo(rb)
                // Kommende: der früheste zuerst; sonst der jüngste.
                ra == 1 -> a.startsAt.compareTo(b.startsAt)
                else -> b.startsAt.compareTo(a.startsAt)
            }
        }
    }

    companion object {
        /** Ohne Ende gilt ein Termin bis sechs Stunden nach Beginn als kommend (wie in der Eventliste). */
        private val OPEN_END: Duration = Duration.ofHours(6)

        fun seriesKey(rootId: UUID) = "series:$rootId"
    }
}
