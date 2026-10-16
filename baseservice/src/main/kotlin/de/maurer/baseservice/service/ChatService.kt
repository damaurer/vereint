package de.maurer.baseservice.service

import de.maurer.baseservice.domain.ChatMessageEntity
import de.maurer.baseservice.domain.ConversationEntity
import de.maurer.baseservice.domain.ConversationMemberEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventGuestEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.GuestStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.ChatMessageDto
import de.maurer.baseservice.dto.ConversationDto
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.InvitationExpiredException
import de.maurer.baseservice.error.InvitationRevokedException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.ChatMessageRepository
import de.maurer.baseservice.repository.ConversationMemberRepository
import de.maurer.baseservice.repository.ConversationRepository
import de.maurer.baseservice.repository.EventGuestRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.support.SecureTokens
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.jvm.optionals.getOrNull

/**
 * Fachlicher Slice für den Event-Chat und die Chat-Mitgliedschaften (TICKET-019).
 *
 * Chats sind kontext- und mitgliedschaftsabhängig verfügbar. Jeder Zugriff wird
 * serverseitig geprüft (`deny by default`): Mitglieder erreichen einen Event-Chat
 * nur als Owner, Teilnehmer oder Vorstand/Administration; Gäste erreichen
 * ausschließlich den ihrem eventgebundenen Gast-Token zugewiesenen Chat und kein
 * anderes Event (siehe `docs/fachkonzept.md`, Abschnitt „Chat, Notifications und
 * Moments"). Der Rohwert eines Gast-Tokens wird nur über seinen SHA-256-Hash
 * aufgelöst, formatgleich mit [AccessResolverService].
 */
@Service
@Transactional
class ChatService(
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val conversationRepository: ConversationRepository,
    private val conversationMemberRepository: ConversationMemberRepository,
    private val chatMessageRepository: ChatMessageRepository,
    private val eventGuestRepository: EventGuestRepository,
    private val access: StammtischAccess,
    private val userService: UserService
) {

    // --- Mitglieder (authentifiziert per JWT) ---

    // Nicht readOnly: legt den Event-Chat beim ersten Abruf an.
    fun getConversation(eventId: UUID, principal: UserPrincipal): ConversationDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)
        val conversation = requireEventConversation(event)
        return toConversationDto(conversation)
    }

    fun listMessages(eventId: UUID, principal: UserPrincipal): List<ChatMessageDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)
        val conversation = requireEventConversation(event)
        ensureMember(conversation, caller)
        return messagesOf(conversation)
    }

    fun sendMessage(eventId: UUID, request: SendMessageRequest, principal: UserPrincipal): ChatMessageDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)
        requireEventOpenForChat(event)
        val conversation = requireEventConversation(event)
        ensureMember(conversation, caller)

        val message = ChatMessageEntity(
            conversation = conversation,
            sender = caller,
            guest = null,
            message = requireMessageText(request.message),
            imageUrl = normalizeImageUrl(request.imageUrl)
        )
        return toMessageDto(chatMessageRepository.save(message))
    }

    // --- Gäste (Gast-Token statt JWT) ---

    fun listGuestMessages(eventId: UUID, guestToken: String?): List<ChatMessageDto> {
        val guest = resolveActiveGuest(eventId, guestToken)
        val event = guest.event ?: throw ResourceNotFoundException(Msg("error.event.notFound", eventId), ErrorCode.NOT_FOUND)
        val conversation = requireEventConversation(event)
        ensureGuestMember(conversation, guest)
        return messagesOf(conversation)
    }

    fun sendGuestMessage(eventId: UUID, guestToken: String?, request: SendMessageRequest): ChatMessageDto {
        val guest = resolveActiveGuest(eventId, guestToken)
        val event = guest.event ?: throw ResourceNotFoundException(Msg("error.event.notFound", eventId), ErrorCode.NOT_FOUND)
        requireEventOpenForChat(event)
        val conversation = requireEventConversation(event)
        ensureGuestMember(conversation, guest)

        val message = ChatMessageEntity(
            conversation = conversation,
            sender = null,
            guest = guest,
            message = requireMessageText(request.message),
            imageUrl = normalizeImageUrl(request.imageUrl)
        )
        return toMessageDto(chatMessageRepository.save(message))
    }

    /**
     * Erstellt eine temporäre Konversation für einen Gemeinschaftsmoment mit 24h Gültigkeit.
     */
    fun createMomentConversation(event: EventEntity, title: String): ConversationEntity {
        val now = Instant.now()
        val conversation = ConversationEntity(
            type = CONVERSATION_TYPE_MOMENT,
            event = event,
            title = "Moment: $title",
            createdAt = now,
            expiresAt = now.plus(Duration.ofHours(24))
        )
        return conversationRepository.save(conversation)
    }

    /**
     * Ruft eine Konversation anhand ihrer ID ab und prüft Gültigkeit sowie Ablauf (z. B. 24h-Moment-Chat).
     */
    @Transactional(readOnly = true)
    fun getConversationById(conversationId: UUID, principal: UserPrincipal): ConversationDto {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireActiveConversation(conversationId)
        val event = conversation.event ?: throw ResourceNotFoundException(Msg("error.chat.eventNotFound"), ErrorCode.NOT_FOUND)
        requireMemberAccess(caller, principal, event)
        return toConversationDto(conversation)
    }

    /**
     * Listet die Nachrichten einer Konversation auf und verwehrt Zugriff bei abgelaufenen Moment-Chats.
     */
    fun listConversationMessages(conversationId: UUID, principal: UserPrincipal): List<ChatMessageDto> {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireActiveConversation(conversationId)
        val event = conversation.event ?: throw ResourceNotFoundException(Msg("error.chat.eventNotFound"), ErrorCode.NOT_FOUND)
        requireMemberAccess(caller, principal, event)
        ensureMember(conversation, caller)
        return messagesOf(conversation)
    }

    /**
     * Sendet eine Nachricht an eine Konversation und verwehrt Zugriff bei abgelaufenen Moment-Chats.
     */
    fun sendConversationMessage(
        conversationId: UUID,
        request: SendMessageRequest,
        principal: UserPrincipal
    ): ChatMessageDto {
        val caller = userService.getOrCreateUser(principal)
        val conversation = requireActiveConversation(conversationId)
        val event = conversation.event ?: throw ResourceNotFoundException(Msg("error.chat.eventNotFound"), ErrorCode.NOT_FOUND)
        requireMemberAccess(caller, principal, event)
        requireEventOpenForChat(event)
        ensureMember(conversation, caller)

        val message = ChatMessageEntity(
            conversation = conversation,
            sender = caller,
            guest = null,
            message = requireMessageText(request.message),
            imageUrl = normalizeImageUrl(request.imageUrl)
        )
        return toMessageDto(chatMessageRepository.save(message))
    }

    /** Prüft, ob eine Konversation existiert und noch nicht abgelaufen / archiviert ist. */
    fun requireActiveConversation(conversationId: UUID): ConversationEntity {
        val conversation = conversationRepository.findById(conversationId).orElseThrow {
            ResourceNotFoundException(Msg("error.chat.notFound", conversationId), ErrorCode.NOT_FOUND)
        }
        val expiresAt = conversation.expiresAt
        if (expiresAt != null && expiresAt.isBefore(Instant.now())) {
            throw InvalidRequestException(Msg("error.chat.archived"), ErrorCode.INVALID_REQUEST)
        }
        return conversation
    }

    // --- Interne Helfer ---

    internal fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.event.notFound", id), ErrorCode.NOT_FOUND)
        }

    /**
     * Liefert die Event-Konversation oder legt sie beim ersten Zugriff an. Je
     * Event existiert genau eine Konversation vom Typ `event`.
     */
    internal fun requireEventConversation(event: EventEntity): ConversationEntity {
        val key = eventConversationKey(event.id)
        conversationRepository.findByDirectKey(key).getOrNull()?.let { return it }
        conversationRepository.insertEventIfAbsent(UUID.randomUUID(), TenantContext.requireStammtischId(), CONVERSATION_TYPE_EVENT, event.id, event.title, key)
        return conversationRepository.findByDirectKey(key).orElseThrow()
    }

    /** Mitglieder erreichen den Chat als Owner, Teilnehmer oder Vorstand/Administration. */
    internal fun requireMemberAccess(caller: UserEntity, principal: UserPrincipal, event: EventEntity) {
        val allowed = isBoardOrAdmin(caller, principal) ||
            event.owner?.id == caller.id ||
            eventParticipantRepository.findByEventIdAndUserId(event.id, caller.id).isPresent
        if (!allowed) {
            throw AccessDeniedException(
                Msg("error.chat.accessDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    /** Beendete oder abgesagte Events nehmen keine neuen Nachrichten mehr an. */
    internal fun requireEventOpenForChat(event: EventEntity) {
        if (event.status == EventStatus.cancelled || event.status == EventStatus.archived) {
            throw EventNotActiveException(
                Msg("error.chat.eventClosed"),
                ErrorCode.EVENT_NOT_ACTIVE
            )
        }
    }

    /**
     * Löst das Gast-Token zu einem aktiven, eventgebundenen Gast auf. Ein Gast
     * kann ausschließlich den ihm zugewiesenen Event-Chat erreichen; ein Token für
     * ein anderes Event wird nicht akzeptiert.
     */
    private fun resolveActiveGuest(eventId: UUID, guestToken: String?): EventGuestEntity {
        val raw = guestToken?.trim()
        if (raw.isNullOrEmpty()) {
            throw AccessDeniedException(Msg("error.guest.tokenRequired"), ErrorCode.ACCESS_DENIED)
        }

        val guest = eventGuestRepository.findByGuestTokenHash(SecureTokens.sha256Hex(raw)).orElseThrow {
            // Neutrale Meldung ohne Tokenwert; ungültige Token liefern deny by default.
            AccessDeniedException(Msg("error.guest.tokenInvalid"), ErrorCode.ACCESS_DENIED)
        }

        if (guest.event?.id != eventId) {
            throw AccessDeniedException(
                Msg("error.guest.tokenWrongEvent"),
                ErrorCode.ACCESS_DENIED
            )
        }

        val event = guest.event
            ?: throw ResourceNotFoundException(Msg("error.event.notFound", eventId), ErrorCode.NOT_FOUND)
        if (event.status == EventStatus.cancelled || event.status == EventStatus.archived) {
            throw EventNotActiveException(Msg("error.event.notActive"), ErrorCode.EVENT_NOT_ACTIVE)
        }

        if (guest.status == GuestStatus.revoked) {
            throw InvitationRevokedException(Msg("error.guest.revoked"), ErrorCode.INVITATION_REVOKED)
        }
        if (guest.status == GuestStatus.expired || guest.expiresAt.isBefore(Instant.now())) {
            throw InvitationExpiredException(Msg("error.guest.expired"), ErrorCode.INVITATION_EXPIRED)
        }
        if (guest.status != GuestStatus.active) {
            throw AccessDeniedException(Msg("error.guest.notActive"), ErrorCode.ACCESS_DENIED)
        }
        return guest
    }

    internal fun ensureMember(conversation: ConversationEntity, user: UserEntity) {
        if (conversationMemberRepository.findByConversationIdAndUserId(conversation.id, user.id).isEmpty) {
            conversationMemberRepository.insertUserIfAbsent(UUID.randomUUID(), TenantContext.requireStammtischId(), conversation.id, user.id)
        }
    }

    private fun ensureGuestMember(conversation: ConversationEntity, guest: EventGuestEntity) {
        if (conversationMemberRepository.findByConversationIdAndGuestId(conversation.id, guest.id).isEmpty) {
            conversationMemberRepository.save(
                ConversationMemberEntity(conversation = conversation, user = null, guest = guest)
            )
        }
    }

    private fun messagesOf(conversation: ConversationEntity): List<ChatMessageDto> =
        chatMessageRepository.findByConversationIdOrderByCreatedAtAsc(conversation.id)
            .map { toMessageDto(it) }

    internal fun requireMessageText(value: String?): String {
        val text = value?.trim()
        if (text.isNullOrEmpty()) {
            throw InvalidRequestException(Msg("error.field.blank", "message"), ErrorCode.INVALID_REQUEST)
        }
        return text
    }

    internal fun normalizeImageUrl(value: String?): String? = value?.trim()?.ifBlank { null }

    internal fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        access.hasAny(principal, caller, Permission.CHAT_MODERATE, Permission.EVENT_MANAGE)

    private fun toConversationDto(conversation: ConversationEntity): ConversationDto =
        ConversationDto(
            id = conversation.id.toString(),
            type = conversation.type,
            eventId = conversation.event?.id?.toString(),
            title = conversation.title,
            memberCount = conversationMemberRepository.countByConversationId(conversation.id).toInt(),
            expiresAt = conversation.expiresAt
        )

    internal fun toMessageDto(message: ChatMessageEntity): ChatMessageDto {
        val sender = message.sender
        val guest = message.guest
        val senderType = if (sender != null) SENDER_TYPE_MEMBER else SENDER_TYPE_GUEST
        val senderId = sender?.id?.toString() ?: guest?.id?.toString()
        val senderName = sender?.displayName ?: guest?.displayName ?: UNKNOWN_SENDER_NAME
        return ChatMessageDto(
            id = message.id.toString(),
            conversationId = message.conversation?.id?.toString().orEmpty(),
            senderType = senderType,
            senderId = senderId,
            senderName = senderName,
            message = message.message,
            imageUrl = message.imageUrl,
            createdAt = message.createdAt
        )
    }

    companion object {
        const val CONVERSATION_TYPE_EVENT = "event"
        const val CONVERSATION_TYPE_MOMENT = "moment"

        /** Eindeutiger Schlüssel des einen Chats je Event (Spalte `direct_key`). */
        fun eventConversationKey(eventId: UUID) = "event:$eventId"
        const val SENDER_TYPE_MEMBER = "member"
        const val SENDER_TYPE_GUEST = "guest"
        const val UNKNOWN_SENDER_NAME = "Unbekannt"
    }
}
