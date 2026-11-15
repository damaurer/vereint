package de.maurer.baseservice.service

import de.maurer.baseservice.domain.ChatMessageEntity
import de.maurer.baseservice.domain.ConversationEntity
import de.maurer.baseservice.live.LiveEvent
import de.maurer.baseservice.live.LiveUpdateHub
import de.maurer.baseservice.push.PushDispatcher
import de.maurer.baseservice.push.PushMessage
import de.maurer.baseservice.repository.ConversationMemberRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.tenancy.StammtischMembers
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Meldet Änderungen in Gruppen-, Event- und Moment-Chats sofort weiter: als
 * Live-Signal an alle offenen Geräte der Leserinnen und Leser und, bei neuen
 * Nachrichten im Gruppen- und Event-Chat, als Web Push an alle außer der
 * Absenderin.
 *
 * Wer ein Signal bekommt, folgt den Leserechten:
 * - Gruppenchat: alle aktiven Mitglieder der Gruppe
 * - Event-Chat: Owner und Eingeladene, deren Einladung schon verschickt ist
 * - Moment-Chat: wer den Chat schon geöffnet hat (Mitglied der Konversation);
 *   dafür gibt es keinen Push, weil diese Chats nach 24 Stunden enden
 *
 * Den Inhalt eines Pushs lädt der Service Worker über die persönlichen
 * Mitteilungen nach ([PersonalAlertService]); Push und Live-Signal selbst
 * tragen keinen Chattext.
 */
@Component
class ChatNotifier(
    private val members: StammtischMembers,
    private val eventParticipantRepository: EventParticipantRepository,
    private val conversationMemberRepository: ConversationMemberRepository,
    private val liveUpdateHub: LiveUpdateHub,
    private val pushDispatcher: PushDispatcher
) {

    /** Neue Nachricht: Live-Signal an alle Leser (auch die eigenen anderen Geräte), Push an alle anderen. */
    fun messageSent(message: ChatMessageEntity) {
        val conversation = message.conversation ?: return
        val audience = audienceOf(conversation)
        publish(conversation, audience)
        if (conversation.type == ConversationService.TYPE_CLUB || conversation.type == ConversationService.TYPE_EVENT) {
            val recipients = audience - setOfNotNull(message.sender?.id)
            val senderName = message.sender?.displayName ?: message.guest?.displayName ?: ChatService.UNKNOWN_SENDER_NAME
            pushDispatcher.dispatch(
                recipients,
                PushMessage(title = senderName, body = "", type = TYPE_CHAT_MESSAGE),
                live = false
            )
        }
    }

    /** Reaktion oder sonstige Änderung ohne Push. */
    fun changed(conversation: ConversationEntity) {
        publish(conversation, audienceOf(conversation))
    }

    private fun publish(conversation: ConversationEntity, audience: Set<UUID>) {
        liveUpdateHub.publish(
            audience,
            LiveEvent(
                type = LiveEvent.CHAT,
                stammtischId = TenantContext.stammtischId()?.toString(),
                conversationId = conversation.id.toString()
            )
        )
    }

    internal fun audienceOf(conversation: ConversationEntity): Set<UUID> = when (conversation.type) {
        ConversationService.TYPE_CLUB -> members.activeUsers().map { it.id }.toSet()
        ConversationService.TYPE_EVENT -> {
            val event = conversation.event
            if (event == null) {
                emptySet()
            } else {
                val invited = eventParticipantRepository.findByEventId(event.id)
                    .filter { it.invitationSentAt != null }
                    .mapNotNull { it.user }
                    .filter { !it.disabled }
                    .map { it.id }
                (invited + listOfNotNull(event.owner?.takeIf { !it.disabled }?.id)).toSet()
            }
        }
        else -> conversationMemberRepository.findByConversationId(conversation.id).mapNotNull { it.user?.id }.toSet()
    }

    companion object {
        const val TYPE_CHAT_MESSAGE = "chat_message"
    }
}
