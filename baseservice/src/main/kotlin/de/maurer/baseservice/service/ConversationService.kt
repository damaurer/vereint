package de.maurer.baseservice.service

import de.maurer.baseservice.domain.ChatMessageEntity
import de.maurer.baseservice.domain.ChatReactionEntity
import de.maurer.baseservice.domain.ConversationEntity
import de.maurer.baseservice.domain.ConversationMemberEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.MomentSessionEntity
import de.maurer.baseservice.domain.StatisticFeature
import de.maurer.baseservice.domain.StatisticKind
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
import de.maurer.baseservice.live.LiveEvent
import de.maurer.baseservice.live.LiveUpdateHub
import de.maurer.baseservice.live.TypingSignals
import de.maurer.baseservice.repository.ChatMessageRepository
import de.maurer.baseservice.repository.ChatReactionRepository
import de.maurer.baseservice.repository.ConversationMemberRepository
import de.maurer.baseservice.repository.ConversationRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.MomentSessionRepository
import de.maurer.baseservice.security.UserPrincipal
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
 * - Direktnachrichten sind gruppenübergreifend und liegen im
 *   [DirectMessageService]; hier zählen sie nur beim Ungelesen-Zähler mit.
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
    private val userService: UserService,
    private val chatService: ChatService,
    private val directMessageService: DirectMessageService,
    private val statisticsRecorder: StatisticsRecorder,
    private val chatNotifier: ChatNotifier,
    private val liveUpdateHub: LiveUpdateHub,
    private val chatReceipts: ChatReceipts,
    private val typingSignals: TypingSignals,
    private val mediaAttachments: ChatMediaAttachments,
    private val momentSessionRepository: MomentSessionRepository,
    private val momentAccessPolicy: MomentAccessPolicy
) {

    fun listConversations(principal: UserPrincipal): List<ConversationSummaryDto> {
        val caller = userService.getOrCreateUser(principal)
        val club = clubConversation()
        val events = eventConversations(caller)
        val moments = momentConversations(caller, principal)

        val summaries = listOf(club) + events + moments.keys
        return summaries
            .distinctBy { it.id }
            // Die Liste zeigt die neueste Nachricht: damit ist der Chat zugestellt.
            .onEach { chatReceipts.delivered(it, caller) }
            .map { conversation ->
                val summary = toSummary(conversation, caller, principal)
                moments[conversation]?.let { summary.copy(momentId = it.id.toString(), expiresAt = conversation.expiresAt) } ?: summary
            }
            .sortedWith(
                compareBy<ConversationSummaryDto> { it.type != TYPE_CLUB }
                    .thenByDescending { it.lastMessage?.createdAt ?: Instant.EPOCH }
            )
    }

    /** Ungelesen in Gruppen- und Event-Chats dieser Gruppe plus alle Direktnachrichten. */
    fun unreadCount(principal: UserPrincipal): ChatUnreadCountDto {
        val caller = userService.getOrCreateUser(principal)
        val groupChats = listConversations(principal).sumOf { it.unreadCount }
        return ChatUnreadCountDto(unread = groupChats + directMessageService.unreadTotal(caller))
    }

    fun listMessages(conversationId: UUID, principal: UserPrincipal): List<ChatMessageDto> {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireReadable(conversationId, caller, principal)
        chatReceipts.delivered(conversation, caller)
        val messages = chatMessageRepository.findByConversationIdOrderByCreatedAtAsc(conversation.id)
        val receipts = chatReceipts.receiptsFor(conversation, messages, caller, chatNotifier.audienceOf(conversation))
        return withReactions(messages, caller).map { dto ->
            receipts[UUID.fromString(dto.id)]?.let { dto.copy(receipt = it) } ?: dto
        }
    }

    fun sendMessage(conversationId: UUID, request: SendMessageRequest, principal: UserPrincipal): ChatMessageDto {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireReadable(conversationId, caller, principal)
        // Erneutes Senden nach Verbindungsabbruch: die schon gespeicherte Nachricht zurückgeben.
        val clientId = request.clientId?.trim()?.ifBlank { null }
        if (clientId != null) {
            chatMessageRepository.findBySenderIdAndClientId(caller.id, clientId).orElse(null)?.let { existing ->
                if (existing.conversation?.id != conversation.id) {
                    throw InvalidRequestException(Msg("error.chat.clientIdUsed"), ErrorCode.INVALID_REQUEST)
                }
                return ownMessageDto(existing, conversation, caller)
            }
        }
        conversation.event?.let { chatService.requireEventOpenForChat(it) }
        val mediaIds = mediaAttachments.parseIds(request.mediaIds)
        val text = request.message?.trim().orEmpty()
        // Ohne Foto oder Video braucht die Nachricht Text.
        if (mediaIds.isEmpty()) chatService.requireMessageText(text)
        val saved = chatMessageRepository.save(
            ChatMessageEntity(
                conversation = conversation,
                sender = caller,
                message = text,
                imageUrl = chatService.normalizeImageUrl(request.imageUrl),
                clientId = clientId
            )
        )
        val media = mediaAttachments.attachGroup(mediaIds, conversation.id, caller.id, saved.id)
        chatService.recordMessage(saved, caller, conversation.event, media)
        // Eigene Nachrichten gelten als gelesen.
        membership(conversation, caller).lastReadAt = saved.createdAt
        return ownMessageDto(saved, conversation, caller)
    }

    fun markRead(conversationId: UUID, principal: UserPrincipal): ConversationSummaryDto {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireReadable(conversationId, caller, principal)
        val member = membership(conversation, caller)
        val previousRead = member.lastReadAt
        member.lastReadAt = Instant.now()
        chatReceipts.read(conversation, caller, member, previousRead)
        // Zähler auf den anderen Geräten der Person gleich mitziehen.
        liveUpdateHub.publish(listOf(caller.id), LiveEvent(LiveEvent.READ, TenantContext.stammtischId()?.toString(), conversation.id.toString()))
        return toSummary(conversation, caller, principal)
    }

    /**
     * „schreibt gerade…“: meldet den anderen Lesenden, dass [principal] tippt.
     * Nur wer schreiben darf, sendet das Signal.
     */
    fun typing(conversationId: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireReadable(conversationId, caller, principal)
        conversation.event?.let { chatService.requireEventOpenForChat(it) }
        typingSignals.typing(
            userId = caller.id,
            name = caller.displayName,
            conversationId = conversation.id,
            stammtischId = TenantContext.stammtischId()?.toString(),
            audience = chatNotifier.audienceOf(conversation)
        )
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
            val reaction = chatReactionRepository.save(ChatReactionEntity(message = message, user = caller, emoji = emoji))
            if (conversation.type != TYPE_DIRECT) {
                statisticsRecorder.record(
                    StatisticFeature.CHAT_REACTION,
                    kind = StatisticKind.RESPONSE,
                    actor = caller,
                    event = conversation.event,
                    variant = conversation.type,
                    respondsTo = message.id,
                    sourceId = reaction.id
                )
            }
        }
        chatReactionRepository.flush()
        chatNotifier.changed(conversation)
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

    /**
     * Laufende Moment-Chats (24 Stunden nach Start), die [caller] sehen darf,
     * mit ihrem Moment.
     */
    private fun momentConversations(caller: UserEntity, principal: UserPrincipal): Map<ConversationEntity, MomentSessionEntity> {
        val canView = momentAccessPolicy.viewFilter(caller, principal)
        return momentSessionRepository.findByConversationExpiresAtAfter(Instant.now())
            .filter(canView)
            .mapNotNull { session -> session.conversation?.let { it to session } }
            .toMap()
    }

    private fun requireReadable(conversationId: UUID, caller: UserEntity, principal: UserPrincipal): ConversationEntity =
        chatService.requireReadableConversation(conversationId, caller, principal)

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
                ChatService.CONVERSATION_TYPE_MOMENT -> conversation.title ?: event?.title ?: CLUB_TITLE
                else -> event?.title ?: conversation.title ?: CLUB_TITLE
            },
            eventId = event?.id?.toString(),
            partnerId = partner?.id?.toString(),
            partnerName = partner?.displayName,
            lastMessage = last?.let {
                ChatMessagePreviewDto(
                    senderName = it.sender?.displayName ?: it.guest?.displayName ?: ChatService.UNKNOWN_SENDER_NAME,
                    message = it.message,
                    createdAt = it.createdAt,
                    mediaKind = ChatMediaAttachments.previewKind(mediaAttachments.groupMedia(listOf(it.id))[it.id])
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
        val media = mediaAttachments.groupMedia(messages.map { it.id })
        return messages.map { message ->
            val reactions = byMessage[message.id].orEmpty()
                .groupBy { it.emoji }
                .map { (emoji, list) ->
                    ChatReactionDto(emoji = emoji, count = list.size, reactedByMe = list.any { it.user?.id == caller.id })
                }
                .sortedByDescending { it.count }
            chatService.toMessageDto(message).copy(
                reactions = reactions,
                clientId = message.clientId.takeIf { message.sender?.id == caller.id },
                media = media[message.id].orEmpty()
            )
        }
    }

    /** Eigene Nachricht mit App-Id und aktuellen Haken. */
    private fun ownMessageDto(message: ChatMessageEntity, conversation: ConversationEntity, caller: UserEntity): ChatMessageDto {
        val receipt = chatReceipts.receiptsFor(conversation, listOf(message), caller, chatNotifier.audienceOf(conversation))[message.id]
        return chatService.toMessageDto(message).copy(
            clientId = message.clientId,
            receipt = receipt,
            media = mediaAttachments.groupMedia(listOf(message.id))[message.id].orEmpty()
        )
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
