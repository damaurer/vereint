package de.maurer.baseservice.service

import de.maurer.baseservice.domain.ChatMessageEntity
import de.maurer.baseservice.domain.ChatReactionEntity
import de.maurer.baseservice.domain.ConversationEntity
import de.maurer.baseservice.domain.ConversationMemberEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.ChatMessageDto
import de.maurer.baseservice.dto.ChatMessagePreviewDto
import de.maurer.baseservice.dto.ChatReactionDto
import de.maurer.baseservice.dto.ChatUnreadCountDto
import de.maurer.baseservice.dto.ConversationSummaryDto
import de.maurer.baseservice.dto.PinNoteRequest
import de.maurer.baseservice.dto.PinnedNoteDto
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.ChatMessageRepository
import de.maurer.baseservice.repository.ChatReactionRepository
import de.maurer.baseservice.repository.ConversationMemberRepository
import de.maurer.baseservice.repository.ConversationRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischMembers
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID
import kotlin.jvm.optionals.getOrNull

/**
 * Vereinschat, Direktnachrichten und die gemeinsame Chat-Übersicht.
 *
 * - Der Vereinschat (`club`) gehört allen aktiven Mitgliedern; er wird beim
 *   ersten Zugriff angelegt. Die Infotafel darüber pflegen Vorstand und
 *   Administration.
 * - Direktnachrichten (`direct`) gibt es genau einmal je Paar (`direct_key`);
 *   nur die beiden Beteiligten lesen und schreiben.
 * - Event-Chats (`event`) erscheinen in der Übersicht für Owner und
 *   Eingeladene; die Rechte prüft weiterhin [ChatService].
 *
 * Ungelesen zählt jede Nachricht anderer nach dem eigenen Lesestand
 * (`conversation_members.last_read_at`).
 */
@Service
@Transactional
class ConversationService(
    private val conversationRepository: ConversationRepository,
    private val conversationMemberRepository: ConversationMemberRepository,
    private val chatMessageRepository: ChatMessageRepository,
    private val chatReactionRepository: ChatReactionRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val members: StammtischMembers,
    private val userService: UserService,
    private val chatService: ChatService
) {

    fun listConversations(principal: UserPrincipal): List<ConversationSummaryDto> {
        val caller = userService.getOrCreateUser(principal)
        val club = clubConversation()
        val memberships = conversationMemberRepository.findByUserId(caller.id)
            .mapNotNull { it.conversation }
            .filter { it.type == TYPE_DIRECT }
        val events = eventConversations(caller)

        val summaries = listOf(club) + memberships + events
        return summaries
            .distinctBy { it.id }
            .map { toSummary(it, caller, principal) }
            .sortedWith(
                compareBy<ConversationSummaryDto> { it.type != TYPE_CLUB }
                    .thenByDescending { it.lastMessage?.createdAt ?: Instant.EPOCH }
            )
    }

    fun unreadCount(principal: UserPrincipal): ChatUnreadCountDto =
        ChatUnreadCountDto(unread = listConversations(principal).sumOf { it.unreadCount })

    fun startDirect(userIdValue: String?, principal: UserPrincipal): ConversationSummaryDto {
        val caller = userService.getOrCreateUser(principal)
        val partnerId = parseUuid(userIdValue, "userId")
        if (partnerId == caller.id) {
            throw InvalidRequestException(Msg("error.chat.directSelf"), ErrorCode.INVALID_REQUEST)
        }
        // Direktnachrichten nur an Mitglieder desselben Stammtischs.
        val partner = members.requireKnownUser(partnerId)
        if (partner.disabled || !members.isActiveMember(partner.id)) {
            throw InvalidRequestException(Msg("error.chat.partnerDisabled"), ErrorCode.INVALID_REQUEST)
        }
        val key = listOf(caller.id, partner.id).map { it.toString() }.sorted().joinToString(":")
        val conversation = conversationRepository.findByDirectKey(key).orElseGet {
            val created = conversationRepository.save(ConversationEntity(type = TYPE_DIRECT, directKey = key))
            conversationMemberRepository.save(ConversationMemberEntity(conversation = created, user = caller))
            conversationMemberRepository.save(ConversationMemberEntity(conversation = created, user = partner))
            created
        }
        return toSummary(conversation, caller, principal)
    }

    fun listMessages(conversationId: UUID, principal: UserPrincipal): List<ChatMessageDto> {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireReadable(conversationId, caller, principal)
        val messages = chatMessageRepository.findByConversationIdOrderByCreatedAtAsc(conversation.id)
        return withReactions(messages, caller)
    }

    fun sendMessage(conversationId: UUID, request: SendMessageRequest, principal: UserPrincipal): ChatMessageDto {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireReadable(conversationId, caller, principal)
        conversation.event?.let { chatService.requireEventOpenForChat(it) }
        val saved = chatMessageRepository.save(
            ChatMessageEntity(
                conversation = conversation,
                sender = caller,
                message = chatService.requireMessageText(request.message),
                imageUrl = chatService.normalizeImageUrl(request.imageUrl)
            )
        )
        // Eigene Nachrichten gelten als gelesen.
        membership(conversation, caller).lastReadAt = saved.createdAt
        return chatService.toMessageDto(saved)
    }

    fun markRead(conversationId: UUID, principal: UserPrincipal): ConversationSummaryDto {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireReadable(conversationId, caller, principal)
        membership(conversation, caller).lastReadAt = Instant.now()
        return toSummary(conversation, caller, principal)
    }

    fun toggleReaction(
        conversationId: UUID,
        messageId: UUID,
        emojiValue: String?,
        principal: UserPrincipal
    ): ChatMessageDto {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireReadable(conversationId, caller, principal)
        val message = chatMessageRepository.findById(messageId)
            .filter { it.conversation?.id == conversation.id }
            .orElseThrow { ResourceNotFoundException(Msg("error.chat.messageNotFound", messageId), ErrorCode.NOT_FOUND) }
        val emoji = emojiValue?.trim().orEmpty()
        if (emoji.isEmpty() || emoji.length > MAX_EMOJI_LENGTH) {
            throw InvalidRequestException(Msg("error.field.blank", "emoji"), ErrorCode.INVALID_REQUEST)
        }
        val existing = chatReactionRepository.findByMessageIdAndUserIdAndEmoji(message.id, caller.id, emoji)
        if (existing.isPresent) {
            chatReactionRepository.delete(existing.get())
        } else {
            chatReactionRepository.save(ChatReactionEntity(message = message, user = caller, emoji = emoji))
        }
        chatReactionRepository.flush()
        return withReactions(listOf(message), caller).first()
    }

    /** Setzt oder entfernt die Infotafel des Vereinschats (nur Vorstand/Administration). */
    fun pinClubNote(request: PinNoteRequest, principal: UserPrincipal): ConversationSummaryDto {
        val caller = userService.getOrCreateUser(principal)
        if (!chatService.isBoardOrAdmin(caller, principal)) {
            throw AccessDeniedException(Msg("error.chat.pinDenied"), ErrorCode.ACCESS_DENIED)
        }
        val club = clubConversation()
        val text = request.text?.trim()?.ifBlank { null }
        club.pinnedText = text
        club.pinnedBy = if (text == null) null else caller
        club.pinnedAt = if (text == null) null else Instant.now()
        return toSummary(conversationRepository.save(club), caller, principal)
    }

    fun clubSummary(principal: UserPrincipal): ConversationSummaryDto {
        val caller = userService.getOrCreateUser(principal)
        return toSummary(clubConversation(), caller, principal)
    }

    // --- Interne Helfer ---

    private fun clubConversation(): ConversationEntity {
        conversationRepository.findByDirectKey(CLUB_KEY).getOrNull()?.let { return it }
        conversationRepository.insertKeyedIfAbsent(UUID.randomUUID(), TenantContext.requireStammtischId(), TYPE_CLUB, CLUB_TITLE, CLUB_KEY)
        return conversationRepository.findByDirectKey(CLUB_KEY).orElseThrow()
    }

    /** Event-Chats der eigenen bzw. eingeladenen, noch nicht archivierten Events. */
    private fun eventConversations(caller: UserEntity): List<ConversationEntity> {
        val owned = eventRepository.findByOwnerId(caller.id)
        val invited = eventParticipantRepository.findByUserId(caller.id).mapNotNull { it.event }
        return (owned + invited)
            .distinctBy { it.id }
            .filter { it.status != EventStatus.archived && it.status != EventStatus.draft }
            .map { chatService.requireEventConversation(it) }
    }

    private fun requireReadable(conversationId: UUID, caller: UserEntity, principal: UserPrincipal): ConversationEntity {
        val conversation = chatService.requireActiveConversation(conversationId)
        when (conversation.type) {
            TYPE_CLUB -> Unit
            TYPE_DIRECT -> if (conversationMemberRepository.findByConversationIdAndUserId(conversation.id, caller.id).isEmpty) {
                throw AccessDeniedException(Msg("error.chat.directDenied"), ErrorCode.ACCESS_DENIED)
            }
            else -> {
                val event = conversation.event
                    ?: throw ResourceNotFoundException(Msg("error.chat.eventNotFound"), ErrorCode.NOT_FOUND)
                chatService.requireMemberAccess(caller, principal, event)
            }
        }
        return conversation
    }

    private fun membership(conversation: ConversationEntity, user: UserEntity): ConversationMemberEntity {
        chatService.ensureMember(conversation, user)
        return conversationMemberRepository.findByConversationIdAndUserId(conversation.id, user.id).orElseThrow()
    }

    private fun unreadFor(conversation: ConversationEntity, caller: UserEntity): Long {
        val member = conversationMemberRepository.findByConversationIdAndUserId(conversation.id, caller.id).orElse(null)
        // Wer einen Chat noch nie geöffnet hat, zählt erst ab seinem Beitritt bzw. ab Anlage des Chats.
        val since = member?.lastReadAt ?: member?.joinedAt ?: conversation.createdAt
        return chatMessageRepository.countUnread(conversation.id, caller.id, since)
    }

    private fun toSummary(
        conversation: ConversationEntity,
        caller: UserEntity,
        principal: UserPrincipal
    ): ConversationSummaryDto {
        val partner = if (conversation.type == TYPE_DIRECT) {
            conversationMemberRepository.findByConversationId(conversation.id)
                .mapNotNull { it.user }
                .firstOrNull { it.id != caller.id }
        } else {
            null
        }
        val last = chatMessageRepository.findFirstByConversationIdOrderByCreatedAtDesc(conversation.id).orElse(null)
        val event = conversation.event
        val canWrite = event == null ||
            (event.status != EventStatus.cancelled && event.status != EventStatus.archived)
        val pinnedText = conversation.pinnedText
        return ConversationSummaryDto(
            id = conversation.id.toString(),
            type = conversation.type,
            title = when (conversation.type) {
                TYPE_DIRECT -> partner?.displayName ?: ChatService.UNKNOWN_SENDER_NAME
                else -> event?.title ?: conversation.title ?: CLUB_TITLE
            },
            eventId = event?.id?.toString(),
            partnerId = partner?.id?.toString(),
            partnerName = partner?.displayName,
            lastMessage = last?.let {
                ChatMessagePreviewDto(
                    senderName = it.sender?.displayName ?: it.guest?.displayName ?: ChatService.UNKNOWN_SENDER_NAME,
                    message = it.message,
                    createdAt = it.createdAt
                )
            },
            unreadCount = unreadFor(conversation, caller),
            pinned = if (pinnedText != null && conversation.pinnedAt != null) {
                PinnedNoteDto(
                    text = pinnedText,
                    authorName = conversation.pinnedBy?.displayName ?: ChatService.UNKNOWN_SENDER_NAME,
                    pinnedAt = conversation.pinnedAt!!
                )
            } else {
                null
            },
            canWrite = canWrite
        )
    }

    private fun withReactions(messages: List<ChatMessageEntity>, caller: UserEntity): List<ChatMessageDto> {
        if (messages.isEmpty()) return emptyList()
        val byMessage = chatReactionRepository.findByMessageIdIn(messages.map { it.id })
            .groupBy { it.message?.id }
        return messages.map { message ->
            val reactions = byMessage[message.id].orEmpty()
                .groupBy { it.emoji }
                .map { (emoji, list) ->
                    ChatReactionDto(emoji = emoji, count = list.size, reactedByMe = list.any { it.user?.id == caller.id })
                }
                .sortedByDescending { it.count }
            chatService.toMessageDto(message).copy(reactions = reactions)
        }
    }

    private fun parseUuid(value: String?, field: String): UUID {
        val trimmed = value?.trim()
        if (trimmed.isNullOrEmpty()) {
            throw InvalidRequestException(Msg("error.field.blank", field), ErrorCode.INVALID_REQUEST)
        }
        return try {
            UUID.fromString(trimmed)
        } catch (_: IllegalArgumentException) {
            throw InvalidRequestException(Msg("error.field.invalidUuid", field, trimmed), ErrorCode.INVALID_REQUEST)
        }
    }

    companion object {
        const val TYPE_CLUB = "club"
        const val TYPE_DIRECT = "direct"
        const val TYPE_EVENT = ChatService.CONVERSATION_TYPE_EVENT
        const val CLUB_TITLE = "Gruppenchat"

        /** Eindeutiger Schlüssel des einen Vereinschats (Spalte `direct_key`). */
        const val CLUB_KEY = "club"
        const val MAX_EMOJI_LENGTH = 16
    }
}
