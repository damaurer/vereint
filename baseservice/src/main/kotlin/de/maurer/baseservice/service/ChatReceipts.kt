package de.maurer.baseservice.service

import de.maurer.baseservice.domain.ChatMessageEntity
import de.maurer.baseservice.domain.ConversationEntity
import de.maurer.baseservice.domain.ConversationMemberEntity
import de.maurer.baseservice.domain.DirectConversationEntity
import de.maurer.baseservice.domain.DirectMessageEntity
import de.maurer.baseservice.domain.DirectParticipantEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.MessageReceiptDto
import de.maurer.baseservice.live.LiveEvent
import de.maurer.baseservice.live.LiveUpdateHub
import de.maurer.baseservice.repository.ChatMessageRepository
import de.maurer.baseservice.repository.ConversationMemberRepository
import de.maurer.baseservice.repository.DirectMessageRepository
import de.maurer.baseservice.repository.DirectParticipantRepository
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.stereotype.Component
import java.time.Instant
import java.util.UUID

/**
 * Zugestellt- und Gelesen-Haken für Gruppen-, Event-, Moment-Chats und
 * Direktnachrichten.
 *
 * Grundlage sind zwei Zeitstempel je Mitgliedschaft: `last_delivered_at` (bis
 * hierhin ist der Chat auf einem Gerät angekommen) und `last_read_at` (bis
 * hierhin gelesen). Zugestellt gilt, sobald die App die Chat-Liste, den
 * Verlauf oder den Ungelesen-Zähler geladen hat oder der Service Worker nach
 * einem Push nachgeladen hat. Gelesen gilt, sobald der Chat sichtbar offen war.
 *
 * Ändert sich etwas, bekommen nur die Absender der betroffenen Nachrichten ein
 * Live-Signal `receipt`; ihre App lädt den Verlauf dann neu. Die Signale tragen
 * wie alle Live-Signale keinen Inhalt.
 *
 * Läuft in der Transaktion des Aufrufers; Gruppen-Chats im Kontext ihrer Gruppe.
 */
@Component
class ChatReceipts(
    private val conversationMemberRepository: ConversationMemberRepository,
    private val chatMessageRepository: ChatMessageRepository,
    private val directParticipantRepository: DirectParticipantRepository,
    private val directMessageRepository: DirectMessageRepository,
    private val liveUpdateHub: LiveUpdateHub
) {

    // --- Gruppen-, Event- und Moment-Chats ---

    /**
     * Merkt sich, dass [conversation] bei [reader] angekommen ist, und meldet es
     * den Absendern neuer Nachrichten. Schreibt nur, wenn es seit dem letzten
     * Stand neue Nachrichten anderer gibt.
     */
    fun delivered(conversation: ConversationEntity, reader: UserEntity) {
        val member = conversationMemberRepository.findByConversationIdAndUserId(conversation.id, reader.id).orElse(null)
        val since = member?.let { reachedAt(it.lastDeliveredAt, it.lastReadAt) } ?: Instant.EPOCH
        val latest = chatMessageRepository.latestForeignAfter(conversation.id, reader.id, since) ?: return
        val row = member ?: membershipFor(conversation, reader) ?: return
        row.lastDeliveredAt = latest
        notifySenders(conversation, reader, since, latest)
    }

    /**
     * Nach dem Setzen des Lesestands von [member] (vorher [previousRead]): meldet
     * den Absendern der nun gelesenen Nachrichten die neuen Haken.
     */
    fun read(conversation: ConversationEntity, reader: UserEntity, member: ConversationMemberEntity, previousRead: Instant?) {
        val readAt = member.lastReadAt ?: return
        val since = reachedAt(previousRead, null) ?: Instant.EPOCH
        if (member.lastDeliveredAt == null || member.lastDeliveredAt!!.isBefore(readAt)) member.lastDeliveredAt = readAt
        notifySenders(conversation, reader, since, readAt)
    }

    /**
     * Haken der eigenen Nachrichten von [caller] in [messages]. [audience] sind
     * alle, die den Chat lesen dürfen; der Absender selbst zählt nicht mit.
     */
    fun receiptsFor(
        conversation: ConversationEntity,
        messages: List<ChatMessageEntity>,
        caller: UserEntity,
        audience: Set<UUID>
    ): Map<UUID, MessageReceiptDto> {
        val own = messages.filter { it.sender?.id == caller.id }
        if (own.isEmpty()) return emptyMap()
        val states = conversationMemberRepository.findByConversationId(conversation.id)
            .mapNotNull { member -> member.user?.id?.let { it to (member.lastDeliveredAt to member.lastReadAt) } }
            .toMap()
        val recipients = audience - caller.id
        return own.associate { message ->
            message.id to receipt(message.createdAt, recipients.map { states[it] ?: (null to null) })
        }
    }

    // --- Direktnachrichten ---

    /** Wie [delivered] für ein Direktgespräch; [participant] ist die eigene Teilnahme. */
    fun deliveredDirect(conversation: DirectConversationEntity, reader: UserEntity, participant: DirectParticipantEntity) {
        val since = reachedAt(participant.lastDeliveredAt, participant.lastReadAt) ?: Instant.EPOCH
        val latest = directMessageRepository.latestForeignAfter(conversation.id, reader.id, since) ?: return
        participant.lastDeliveredAt = latest
        notifyDirectSenders(conversation, reader, since, latest)
    }

    /** Wie [read] für ein Direktgespräch. */
    fun readDirect(conversation: DirectConversationEntity, reader: UserEntity, participant: DirectParticipantEntity, previousRead: Instant?) {
        val readAt = participant.lastReadAt ?: return
        val since = previousRead ?: Instant.EPOCH
        if (participant.lastDeliveredAt == null || participant.lastDeliveredAt!!.isBefore(readAt)) participant.lastDeliveredAt = readAt
        notifyDirectSenders(conversation, reader, since, readAt)
    }

    /** Haken der eigenen Nachrichten in einem Direktgespräch. */
    fun receiptsForDirect(
        conversation: DirectConversationEntity,
        messages: List<DirectMessageEntity>,
        caller: UserEntity
    ): Map<UUID, MessageReceiptDto> {
        val own = messages.filter { it.sender?.id == caller.id }
        if (own.isEmpty()) return emptyMap()
        val partners = directParticipantRepository.findByConversationId(conversation.id)
            .filter { it.user?.id != caller.id }
            .map { it.lastDeliveredAt to it.lastReadAt }
        return own.associate { message -> message.id to receipt(message.createdAt, partners) }
    }

    // --- Interne Helfer ---

    private fun receipt(createdAt: Instant, states: List<Pair<Instant?, Instant?>>): MessageReceiptDto {
        val read = states.count { (_, readAt) -> readAt != null && !readAt.isBefore(createdAt) }
        val delivered = states.count { (deliveredAt, readAt) ->
            val reached = reachedAt(deliveredAt, readAt)
            reached != null && !reached.isBefore(createdAt)
        }
        val total = states.size
        val status = when {
            total > 0 && read == total -> MessageReceiptDto.READ
            total > 0 && delivered == total -> MessageReceiptDto.DELIVERED
            else -> MessageReceiptDto.SENT
        }
        return MessageReceiptDto(status = status, recipients = total, delivered = delivered, read = read)
    }

    /** Wer gelesen hat, hat auch empfangen. */
    private fun reachedAt(deliveredAt: Instant?, readAt: Instant?): Instant? = when {
        deliveredAt == null -> readAt
        readAt == null -> deliveredAt
        else -> maxOf(deliveredAt, readAt)
    }

    /**
     * Legt die Mitgliedschaft einer Leserin an, die den Chat noch nie geöffnet
     * hat. Beitritt = Anlage des Chats, damit der Ungelesen-Zähler genauso
     * rechnet wie ohne Zeile. Gäste und Moment-Chats ohne Gruppe bleiben außen vor.
     */
    private fun membershipFor(conversation: ConversationEntity, reader: UserEntity): ConversationMemberEntity? {
        val stammtischId = TenantContext.stammtischId() ?: return null
        conversationMemberRepository.insertUserJoinedIfAbsent(
            UUID.randomUUID(), stammtischId, conversation.id, reader.id, conversation.createdAt
        )
        return conversationMemberRepository.findByConversationIdAndUserId(conversation.id, reader.id).orElse(null)
    }

    private fun notifySenders(conversation: ConversationEntity, reader: UserEntity, after: Instant, until: Instant) {
        if (!until.isAfter(after)) return
        val senders = chatMessageRepository.senderIdsBetween(conversation.id, reader.id, after, until)
        if (senders.isEmpty()) return
        liveUpdateHub.publish(
            senders,
            LiveEvent(LiveEvent.RECEIPT, TenantContext.stammtischId()?.toString(), conversation.id.toString())
        )
    }

    private fun notifyDirectSenders(conversation: DirectConversationEntity, reader: UserEntity, after: Instant, until: Instant) {
        if (!until.isAfter(after)) return
        val senders = directMessageRepository.senderIdsBetween(conversation.id, reader.id, after, until)
        if (senders.isEmpty()) return
        liveUpdateHub.publish(senders, LiveEvent(LiveEvent.RECEIPT, conversationId = conversation.id.toString()))
    }
}
