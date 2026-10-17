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
    private val pushDispatcher: PushDispatcher
) {

    @Transactional(readOnly = true)
    fun list(principal: UserPrincipal): List<ConversationSummaryDto> {
        val caller = userService.getOrCreateUser(principal)
        val reachable = reachableIds(caller)
        return participantRepository.findByUserId(caller.id)
            .mapNotNull { it.conversation }
            .map { toSummary(it, caller, reachable) }
            .sortedByDescending { it.lastMessage?.createdAt ?: Instant.EPOCH }
    }

    @Transactional(readOnly = true)
    fun unreadCount(principal: UserPrincipal): ChatUnreadCountDto {
        val caller = userService.getOrCreateUser(principal)
        return ChatUnreadCountDto(unread = unreadTotal(caller))
    }

    /** Summe ungelesener Direktnachrichten über alle eigenen Gespräche. */
    fun unreadTotal(caller: UserEntity): Long =
        participantRepository.findByUserId(caller.id).sumOf { participant ->
            val conversation = participant.conversation ?: return@sumOf 0L
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

    @Transactional(readOnly = true)
    fun messages(conversationId: UUID, principal: UserPrincipal): List<ChatMessageDto> {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireParticipant(conversationId, caller).conversation!!
        return withReactions(messageRepository.findByConversationIdOrderByCreatedAtAsc(conversation.id), caller)
    }

    fun send(conversationId: UUID, request: SendMessageRequest, principal: UserPrincipal): ChatMessageDto {
        val caller = userService.getOrCreateUser(principal)
        val participant = requireParticipant(conversationId, caller)
        val conversation = participant.conversation!!
        val partner = partnerOf(conversation, caller)
        if (partner == null || partner.disabled || !canMessage(caller.id, partner.id)) {
            throw AccessDeniedException(Msg("error.chat.directNotAllowed"), ErrorCode.ACCESS_DENIED)
        }
        val text = request.message?.trim()
        if (text.isNullOrEmpty()) {
            throw InvalidRequestException(Msg("error.field.blank", "message"), ErrorCode.INVALID_REQUEST)
        }
        val saved = messageRepository.save(
            DirectMessageEntity(
                conversation = conversation,
                sender = caller,
                message = text,
                imageUrl = request.imageUrl?.trim()?.ifBlank { null }
            )
        )
        // Eigene Nachrichten gelten als gelesen.
        participant.lastReadAt = saved.createdAt
        pushDispatcher.dispatch(
            listOf(partner.id),
            PushMessage(title = caller.displayName, body = "", type = PersonalAlertService.TYPE_DIRECT_MESSAGE)
        )
        return toMessageDto(saved)
    }

    fun markRead(conversationId: UUID, principal: UserPrincipal): ConversationSummaryDto {
        val caller = userService.getOrCreateUser(principal)
        val participant = requireParticipant(conversationId, caller)
        participant.lastReadAt = Instant.now()
        participantRepository.flush()
        return toSummary(participant.conversation!!, caller, reachableIds(caller))
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
        return withReactions(listOf(message), caller).first()
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
                    createdAt = it.createdAt
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

    private fun withReactions(messages: List<DirectMessageEntity>, caller: UserEntity): List<ChatMessageDto> {
        if (messages.isEmpty()) return emptyList()
        val byMessage = reactionRepository.findByMessageIdIn(messages.map { it.id }).groupBy { it.message?.id }
        return messages.map { message ->
            val reactions = byMessage[message.id].orEmpty()
                .groupBy { it.emoji }
                .map { (emoji, list) ->
                    ChatReactionDto(emoji = emoji, count = list.size, reactedByMe = list.any { it.user?.id == caller.id })
                }
                .sortedByDescending { it.count }
            toMessageDto(message).copy(reactions = reactions)
        }
    }
}
