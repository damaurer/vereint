package de.maurer.baseservice.service

import de.maurer.baseservice.domain.DirectConversationEntity
import de.maurer.baseservice.domain.DirectMessageEntity
import de.maurer.baseservice.domain.DirectParticipantEntity
import de.maurer.baseservice.domain.DirectReactionEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.ChatMessageDto
import de.maurer.baseservice.dto.ChatMessagePreviewDto
import de.maurer.baseservice.dto.ChatReactionDto
import de.maurer.baseservice.dto.ChatUnreadCountDto
import de.maurer.baseservice.dto.ConversationSummaryDto
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Messages
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.push.PushDispatcher
import de.maurer.baseservice.push.PushMessage
import de.maurer.baseservice.repository.DirectConversationRepository
import de.maurer.baseservice.repository.DirectMessageRepository
import de.maurer.baseservice.repository.DirectParticipantRepository
import de.maurer.baseservice.repository.DirectReactionRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.support.Identifiers
import de.maurer.baseservice.tenancy.SharedGroups
import org.springframework.stereotype.Service
import de.maurer.baseservice.live.LiveEvent
import de.maurer.baseservice.live.LiveUpdateHub
import de.maurer.baseservice.live.TypingSignals
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

/**
 * Gruppenübergreifende Direktnachrichten.
 *
 * - Je Personenpaar gibt es genau ein Gespräch (`pair_key`), egal in welchen
 *   Gruppen beide sind. Lesen und schreiben dürfen nur die beiden Beteiligten.
 * - Ein Gespräch beginnen und neu schreiben darf man mit Freunden und mit
 *   Personen, mit denen man eine Gruppe teilt. Fällt beides weg, bleibt der
 *   Verlauf lesbar, neue Nachrichten sind aber gesperrt (`canWrite = false`).
 * - Wer mit niemandem eine Beziehung hat, findet das Konto nicht (`404`).
 * - Jede neue Nachricht löst beim Gegenüber einen Push aus; den Inhalt lädt der
 *   Service Worker über [PersonalAlertService] nach.
 *
 * Die Endpunkte laufen ohne gewählte Gruppe; die Daten gehören keiner Gruppe.
 */
@Service
@Transactional
class DirectMessageService(
    private val conversationRepository: DirectConversationRepository,
    private val participantRepository: DirectParticipantRepository,
    private val messageRepository: DirectMessageRepository,
    private val reactionRepository: DirectReactionRepository,
    private val userRepository: UserRepository,
    private val userService: UserService,
    private val friendService: FriendService,
    private val sharedGroups: SharedGroups,
    private val pushDispatcher: PushDispatcher,
    private val liveUpdateHub: LiveUpdateHub,
    private val chatReceipts: ChatReceipts,
    private val typingSignals: TypingSignals,
    private val mediaAttachments: ChatMediaAttachments
) {

    fun list(principal: UserPrincipal): List<ConversationSummaryDto> {
        val caller = userService.getOrCreateUser(principal)
        val reachable = reachableIds(caller)
        return participantRepository.findByUserId(caller.id)
            .mapNotNull { participant ->
                // Die Liste zeigt die neueste Nachricht: damit ist das Gespräch zugestellt.
                participant.conversation?.also { chatReceipts.deliveredDirect(it, caller, participant) }
            }
            .map { toSummary(it, caller, reachable) }
            .sortedByDescending { it.lastMessage?.createdAt ?: Instant.EPOCH }
    }

    fun unreadCount(principal: UserPrincipal): ChatUnreadCountDto {
        val caller = userService.getOrCreateUser(principal)
        return ChatUnreadCountDto(unread = unreadTotal(caller))
    }

    /**
     * Summe ungelesener Direktnachrichten über alle eigenen Gespräche. Der Zähler
     * steht in der App: was er zählt, ist damit zugestellt.
     */
    fun unreadTotal(caller: UserEntity): Long =
        participantRepository.findByUserId(caller.id).sumOf { participant ->
            val conversation = participant.conversation ?: return@sumOf 0L
            chatReceipts.deliveredDirect(conversation, caller, participant)
            unreadFor(conversation, participant, caller)
        }

    fun start(userIdValue: String?, principal: UserPrincipal): ConversationSummaryDto {
        val caller = userService.getOrCreateUser(principal)
        val partnerId = Identifiers.parseUuid(userIdValue, "userId")
        if (partnerId == caller.id) {
            throw InvalidRequestException(Msg("error.chat.directSelf"), ErrorCode.INVALID_REQUEST)
        }
        val key = FriendService.pairKey(caller.id, partnerId)
        conversationRepository.findByPairKey(key).orElse(null)?.let {
            return toSummary(it, caller, reachableIds(caller))
        }
        if (!canMessage(caller.id, partnerId)) {
            throw ResourceNotFoundException(Msg("error.user.notFound", partnerId), ErrorCode.NOT_FOUND)
        }
        val partner = userRepository.findById(partnerId).orElse(null)
        if (partner == null || partner.disabled) {
            throw InvalidRequestException(Msg("error.chat.partnerDisabled"), ErrorCode.INVALID_REQUEST)
        }
        // `pair_key` ist eindeutig: auch zwei gleichzeitige Anfragen ergeben nur ein Gespräch.
        val conversation = conversationRepository.saveAndFlush(DirectConversationEntity(pairKey = key))
        participantRepository.save(DirectParticipantEntity(conversation = conversation, user = caller))
        participantRepository.save(DirectParticipantEntity(conversation = conversation, user = partner))
        return toSummary(conversation, caller, setOf(partner.id))
    }

    fun messages(conversationId: UUID, principal: UserPrincipal): List<ChatMessageDto> {
        val caller = userService.getOrCreateUser(principal)
        val participant = requireParticipant(conversationId, caller)
        val conversation = participant.conversation!!
        chatReceipts.deliveredDirect(conversation, caller, participant)
        val messages = messageRepository.findByConversationIdOrderByCreatedAtAsc(conversation.id)
        val receipts = chatReceipts.receiptsForDirect(conversation, messages, caller)
        return withReactions(messages, caller).map { dto ->
            receipts[UUID.fromString(dto.id)]?.let { dto.copy(receipt = it) } ?: dto
        }
    }

    fun send(conversationId: UUID, request: SendMessageRequest, principal: UserPrincipal): ChatMessageDto {
        val caller = userService.getOrCreateUser(principal)
        val participant = requireParticipant(conversationId, caller)
        val conversation = participant.conversation!!
        val partner = partnerOf(conversation, caller)
        if (partner == null || partner.disabled || !canMessage(caller.id, partner.id)) {
            throw AccessDeniedException(Msg("error.chat.directNotAllowed"), ErrorCode.ACCESS_DENIED)
        }
        // Erneutes Senden nach Verbindungsabbruch: die schon gespeicherte Nachricht zurückgeben.
        val clientId = request.clientId?.trim()?.ifBlank { null }
        if (clientId != null) {
            messageRepository.findBySenderIdAndClientId(caller.id, clientId).orElse(null)?.let { existing ->
                if (existing.conversation?.id != conversation.id) {
                    throw InvalidRequestException(Msg("error.chat.clientIdUsed"), ErrorCode.INVALID_REQUEST)
                }
                return ownMessageDto(existing, conversation, caller)
            }
        }
        val mediaIds = mediaAttachments.parseIds(request.mediaIds)
        val text = request.message?.trim().orEmpty()
        // Ohne Foto oder Video braucht die Nachricht Text.
        if (text.isEmpty() && mediaIds.isEmpty()) {
            throw InvalidRequestException(Msg("error.field.blank", "message"), ErrorCode.INVALID_REQUEST)
        }
        val saved = messageRepository.save(
            DirectMessageEntity(
                conversation = conversation,
                sender = caller,
                message = text,
                imageUrl = request.imageUrl?.trim()?.ifBlank { null },
                clientId = clientId
            )
        )
        val media = mediaAttachments.attachDirect(mediaIds, conversation.id, caller.id, saved.id)
        // Eigene Nachrichten gelten als gelesen.
        participant.lastReadAt = saved.createdAt
        // Beide Seiten sehen die Nachricht sofort, auch auf weiteren eigenen Geräten.
        liveUpdateHub.publish(listOf(caller.id, partner.id), LiveEvent(LiveEvent.DIRECT, conversationId = conversation.id.toString()))
        pushDispatcher.dispatch(
            listOf(partner.id),
            PushMessage(
                title = Messages.defaultText(Msg("notification.direct.title", caller.displayName)).trim(),
                body = saved.message.ifBlank { Messages.defaultText(ChatNotifier.mediaNotice(media)).trim() },
                type = PersonalAlertService.TYPE_DIRECT_MESSAGE,
                link = "/chat?id=${conversation.id}",
                // Je Gespräch eine Benachrichtigung: eine neue ersetzt die vorige.
                tag = "/chat?id=${conversation.id}"
            ),
            live = false
        )
        return ownMessageDto(saved, conversation, caller)
    }

    fun markRead(conversationId: UUID, principal: UserPrincipal): ConversationSummaryDto {
        val caller = userService.getOrCreateUser(principal)
        val participant = requireParticipant(conversationId, caller)
        val previousRead = participant.lastReadAt
        participant.lastReadAt = Instant.now()
        chatReceipts.readDirect(participant.conversation!!, caller, participant, previousRead)
        participantRepository.flush()
        liveUpdateHub.publish(listOf(caller.id), LiveEvent(LiveEvent.READ, conversationId = conversationId.toString()))
        return toSummary(participant.conversation!!, caller, reachableIds(caller))
    }

    /** „schreibt gerade…“ an das Gegenüber, solange man ihm schreiben darf. */
    fun typing(conversationId: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireParticipant(conversationId, caller).conversation!!
        val partner = partnerOf(conversation, caller)
        if (partner == null || partner.disabled || !canMessage(caller.id, partner.id)) {
            throw AccessDeniedException(Msg("error.chat.directNotAllowed"), ErrorCode.ACCESS_DENIED)
        }
        typingSignals.typing(
            userId = caller.id,
            name = caller.displayName,
            conversationId = conversation.id,
            stammtischId = null,
            audience = listOf(partner.id)
        )
    }

    fun toggleReaction(conversationId: UUID, messageId: UUID, emojiValue: String?, principal: UserPrincipal): ChatMessageDto {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireParticipant(conversationId, caller).conversation!!
        val message = messageRepository.findById(messageId)
            .filter { it.conversation?.id == conversation.id }
            .orElseThrow { ResourceNotFoundException(Msg("error.chat.messageNotFound", messageId), ErrorCode.NOT_FOUND) }
        val emoji = emojiValue?.trim().orEmpty()
        if (emoji.isEmpty() || emoji.length > ConversationService.MAX_EMOJI_LENGTH) {
            throw InvalidRequestException(Msg("error.field.blank", "emoji"), ErrorCode.INVALID_REQUEST)
        }
        val existing = reactionRepository.findByMessageIdAndUserIdAndEmoji(message.id, caller.id, emoji)
        if (existing.isPresent) {
            reactionRepository.delete(existing.get())
        } else {
            reactionRepository.save(DirectReactionEntity(message = message, user = caller, emoji = emoji))
        }
        reactionRepository.flush()
        val participants = participantRepository.findByConversationId(conversation.id).mapNotNull { it.user?.id }
        liveUpdateHub.publish(participants, LiveEvent(LiveEvent.DIRECT, conversationId = conversation.id.toString()))
        return withReactions(listOf(message), caller).first()
    }

    /** Lesezugriff auf ein Gespräch für Beteiligte (sonst `404`). */
    internal fun requireReadableDirect(conversationId: UUID, caller: UserEntity): DirectConversationEntity =
        requireParticipant(conversationId, caller).conversation!!

    /** Schreibzugriff: beteiligt und dem Gegenüber darf man noch schreiben. */
    internal fun requireWritableDirect(conversationId: UUID, caller: UserEntity): DirectConversationEntity {
        val conversation = requireReadableDirect(conversationId, caller)
        val partner = partnerOf(conversation, caller)
        if (partner == null || partner.disabled || !canMessage(caller.id, partner.id)) {
            throw AccessDeniedException(Msg("error.chat.directNotAllowed"), ErrorCode.ACCESS_DENIED)
        }
        return conversation
    }

    // --- Interne Helfer ---

    /** Freunde oder Personen mit gemeinsamer Gruppe. */
    private fun canMessage(callerId: UUID, otherId: UUID): Boolean =
        friendService.areFriends(callerId, otherId) || sharedGroups.between(callerId, otherId).isNotEmpty()

    /** Alle Personen, denen [caller] gerade schreiben darf (für `canWrite` in Listen). */
    private fun reachableIds(caller: UserEntity): Set<UUID> =
        friendService.contactsOf(caller).filter { it.canMessage }.map { UUID.fromString(it.userId) }.toSet()

    /** Nicht Beteiligte erfahren nicht, ob es das Gespräch gibt. */
    private fun requireParticipant(conversationId: UUID, caller: UserEntity): DirectParticipantEntity =
        participantRepository.findByConversationIdAndUserId(conversationId, caller.id).orElseThrow {
            ResourceNotFoundException(Msg("error.chat.directNotFound"), ErrorCode.NOT_FOUND)
        }

    private fun partnerOf(conversation: DirectConversationEntity, caller: UserEntity): UserEntity? =
        participantRepository.findByConversationId(conversation.id)
            .mapNotNull { it.user }
            .firstOrNull { it.id != caller.id }

    private fun unreadFor(conversation: DirectConversationEntity, participant: DirectParticipantEntity?, caller: UserEntity): Long {
        val since = participant?.lastReadAt ?: participant?.joinedAt ?: conversation.createdAt
        return messageRepository.countUnread(conversation.id, caller.id, since)
    }

    private fun toSummary(conversation: DirectConversationEntity, caller: UserEntity, reachable: Set<UUID>): ConversationSummaryDto {
        val participants = participantRepository.findByConversationId(conversation.id)
        val partner = participants.mapNotNull { it.user }.firstOrNull { it.id != caller.id }
        val own = participants.firstOrNull { it.user?.id == caller.id }
        val last = messageRepository.findFirstByConversationIdOrderByCreatedAtDesc(conversation.id).orElse(null)
        return ConversationSummaryDto(
            id = conversation.id.toString(),
            type = ConversationService.TYPE_DIRECT,
            title = partner?.displayName ?: ChatService.UNKNOWN_SENDER_NAME,
            eventId = null,
            partnerId = partner?.id?.toString(),
            partnerName = partner?.displayName,
            lastMessage = last?.let {
                ChatMessagePreviewDto(
                    senderName = it.sender?.displayName ?: ChatService.UNKNOWN_SENDER_NAME,
                    message = it.message,
                    createdAt = it.createdAt,
                    mediaKind = ChatMediaAttachments.previewKind(mediaAttachments.directMedia(listOf(it.id))[it.id])
                )
            },
            unreadCount = unreadFor(conversation, own, caller),
            pinned = null,
            canWrite = partner != null && !partner.disabled && partner.id in reachable
        )
    }

    private fun toMessageDto(message: DirectMessageEntity): ChatMessageDto {
        val sender = message.sender
        return ChatMessageDto(
            id = message.id.toString(),
            conversationId = message.conversation?.id?.toString().orEmpty(),
            senderType = ChatService.SENDER_TYPE_MEMBER,
            senderId = sender?.id?.toString(),
            senderName = sender?.displayName ?: ChatService.UNKNOWN_SENDER_NAME,
            message = message.message,
            imageUrl = message.imageUrl,
            createdAt = message.createdAt
        )
    }

    /** Eigene Nachricht mit App-Id und aktuellen Haken. */
    private fun ownMessageDto(message: DirectMessageEntity, conversation: DirectConversationEntity, caller: UserEntity): ChatMessageDto =
        toMessageDto(message).copy(
            clientId = message.clientId,
            receipt = chatReceipts.receiptsForDirect(conversation, listOf(message), caller)[message.id],
            media = mediaAttachments.directMedia(listOf(message.id))[message.id].orEmpty()
        )

    private fun withReactions(messages: List<DirectMessageEntity>, caller: UserEntity): List<ChatMessageDto> {
        if (messages.isEmpty()) return emptyList()
        val byMessage = reactionRepository.findByMessageIdIn(messages.map { it.id }).groupBy { it.message?.id }
        val media = mediaAttachments.directMedia(messages.map { it.id })
        return messages.map { message ->
            val reactions = byMessage[message.id].orEmpty()
                .groupBy { it.emoji }
                .map { (emoji, list) ->
                    ChatReactionDto(emoji = emoji, count = list.size, reactedByMe = list.any { it.user?.id == caller.id })
                }
                .sortedByDescending { it.count }
            toMessageDto(message).copy(
                reactions = reactions,
                clientId = message.clientId.takeIf { message.sender?.id == caller.id },
                media = media[message.id].orEmpty()
            )
        }
    }
}
