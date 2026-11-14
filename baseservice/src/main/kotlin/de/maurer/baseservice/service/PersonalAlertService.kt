package de.maurer.baseservice.service

import de.maurer.baseservice.domain.FriendshipStatus
import de.maurer.baseservice.dto.NotificationDto
import de.maurer.baseservice.error.Messages
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.domain.ConversationEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.ChatMessageRepository
import de.maurer.baseservice.repository.ConversationMemberRepository
import de.maurer.baseservice.repository.ConversationRepository
import de.maurer.baseservice.repository.DirectMessageRepository
import de.maurer.baseservice.repository.DirectParticipantRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.FriendshipRepository
import de.maurer.baseservice.repository.NotificationRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.MembershipView
import de.maurer.baseservice.tenancy.StammtischMemberships
import de.maurer.baseservice.tenancy.TenantTransactions
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant

/**
 * Alles Ungelesene einer Person über alle ihre Gruppen, für Web Push:
 * ungelesene Direktnachrichten, offene Freundschaftsanfragen, frisch
 * angenommene Freundschaften, ungelesene Gruppen- und Event-Chats und die
 * ungelesenen Mitteilungen jeder Gruppe.
 *
 * Pushes tragen keinen Inhalt. Der Service Worker lädt nach jedem Push diese
 * Liste und zeigt die neueste ungelesene Mitteilung an, egal welche Gruppe in
 * der App gerade gewählt ist; Einträge aus Gruppen tragen dafür `stammtischId`.
 * Chat- und Freundeseinträge werden nicht gespeichert, sondern aus den Daten
 * berechnet: Ein Chat gilt als erledigt, sobald er gelesen ist, eine Anfrage,
 * sobald sie angenommen oder abgelehnt ist. Jeder Eintrag gehört nur dem
 * Aufrufer. Die Daten jeder Gruppe liest eine eigene Transaktion in deren
 * Kontext ([TenantTransactions]), sodass die Gruppentrennung greift.
 */
@Service
@Transactional(readOnly = true)
class PersonalAlertService(
    private val friendshipRepository: FriendshipRepository,
    private val participantRepository: DirectParticipantRepository,
    private val messageRepository: DirectMessageRepository,
    private val userService: UserService,
    private val memberships: StammtischMemberships,
    private val tenantTransactions: TenantTransactions,
    private val notificationRepository: NotificationRepository,
    private val conversationRepository: ConversationRepository,
    private val conversationMemberRepository: ConversationMemberRepository,
    private val chatMessageRepository: ChatMessageRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository
) {

    fun alerts(principal: UserPrincipal, now: Instant = Instant.now()): List<NotificationDto> {
        val caller = userService.getOrCreateUser(principal)
        val direct = participantRepository.findByUserId(caller.id).mapNotNull { participant ->
            val conversation = participant.conversation ?: return@mapNotNull null
            val since = participant.lastReadAt ?: participant.joinedAt
            val latest = messageRepository.findFirstByConversationIdOrderByCreatedAtDesc(conversation.id).orElse(null)
                ?: return@mapNotNull null
            val sender = latest.sender
            if (sender == null || sender.id == caller.id || !latest.createdAt.isAfter(since)) return@mapNotNull null
            NotificationDto(
                id = "direct-${latest.id}",
                title = text(Msg("notification.direct.title", sender.displayName)),
                body = latest.message,
                type = TYPE_DIRECT_MESSAGE,
                read = false,
                createdAt = latest.createdAt,
                link = "/direktnachrichten?id=${conversation.id}"
            )
        }
        val friends = friendshipRepository.findInvolving(caller.id).mapNotNull { friendship ->
            val other = friendship.other(caller.id)?.takeIf { !it.disabled } ?: return@mapNotNull null
            when {
                friendship.status == FriendshipStatus.pending && friendship.addressee?.id == caller.id -> NotificationDto(
                    id = "friend-request-${friendship.id}",
                    title = text(Msg("notification.friend.request.title")),
                    body = text(Msg("notification.friend.request.body", other.displayName)),
                    type = TYPE_FRIEND_REQUEST,
                    read = false,
                    createdAt = friendship.createdAt,
                    link = FRIENDS_LINK
                )
                // Nur kurz nach der Annahme: Dafür gibt es keinen Lesestand.
                friendship.status == FriendshipStatus.accepted && friendship.requester?.id == caller.id &&
                    friendship.acceptedAt?.isAfter(now.minus(ACCEPTED_WINDOW)) == true -> NotificationDto(
                    id = "friend-accepted-${friendship.id}",
                    title = text(Msg("notification.friend.accepted.title")),
                    body = text(Msg("notification.friend.accepted.body", other.displayName)),
                    type = TYPE_FRIEND_ACCEPTED,
                    read = false,
                    createdAt = friendship.acceptedAt!!,
                    link = FRIENDS_LINK
                )
                else -> null
            }
        }
        val groups = memberships.memberships(caller.id).flatMap { membership ->
            tenantTransactions.readInStammtisch(membership.stammtischId) { groupAlerts(caller, membership) }
        }
        return (direct + friends + groups).sortedByDescending { it.createdAt }
    }

    /** Ungelesene Chats und Mitteilungen in einer Gruppe; läuft in deren Kontext. */
    private fun groupAlerts(caller: UserEntity, membership: MembershipView): List<NotificationDto> {
        val stammtischId = membership.stammtischId.toString()
        val notifications = notificationRepository.findByUserIdAndReadFalse(caller.id)
            .sortedByDescending { it.createdAt }
            .take(MAX_NOTIFICATIONS_PER_GROUP)
            .map {
                NotificationDto(
                    id = it.id.toString(),
                    title = it.title,
                    body = it.body,
                    type = it.type,
                    read = false,
                    createdAt = it.createdAt,
                    link = it.link,
                    stammtischId = stammtischId
                )
            }
        val chats = readableChats(caller).mapNotNull { (conversation, chatTitle) ->
            chatAlert(caller, conversation, chatTitle ?: membership.stammtischName, stammtischId)
        }
        return notifications + chats
    }

    /** Gruppenchat und Event-Chats, die die Person liest (wie die Chat-Übersicht), mit Titel. */
    private fun readableChats(caller: UserEntity): List<Pair<ConversationEntity, String?>> {
        val club = conversationRepository.findByDirectKey(ConversationService.CLUB_KEY).orElse(null)
        val owned = eventRepository.findByOwnerId(caller.id)
        val invited = eventParticipantRepository.findByUserId(caller.id)
            .filter { it.invitationSentAt != null }
            .mapNotNull { it.event }
        val events = (owned + invited)
            .distinctBy { it.id }
            .filter { it.status != EventStatus.archived && it.status != EventStatus.draft }
            .mapNotNull { event ->
                conversationRepository.findByDirectKey(ChatService.eventConversationKey(event.id)).orElse(null)
                    ?.let { it to event.title }
            }
        return listOfNotNull(club?.let { it to null }) + events
    }

    private fun chatAlert(
        caller: UserEntity,
        conversation: ConversationEntity,
        chatTitle: String,
        stammtischId: String
    ): NotificationDto? {
        val latest = chatMessageRepository.findFirstByConversationIdOrderByCreatedAtDesc(conversation.id).orElse(null)
            ?: return null
        if (latest.sender?.id == caller.id) return null
        val member = conversationMemberRepository.findByConversationIdAndUserId(conversation.id, caller.id).orElse(null)
        // Nie geöffnet: zählt erst ab Anlage des Chats, aber nichts von vor dem eigenen Konto.
        val since = member?.lastReadAt ?: member?.joinedAt ?: maxOf(conversation.createdAt, caller.createdAt)
        if (!latest.createdAt.isAfter(since)) return null
        val senderName = latest.sender?.displayName ?: latest.guest?.displayName ?: ChatService.UNKNOWN_SENDER_NAME
        return NotificationDto(
            // Je Chat derselbe Tag im Service Worker: neue Nachrichten ersetzen ältere.
            id = "chat-${latest.id}",
            title = text(Msg("notification.chat.title", senderName, chatTitle)),
            body = latest.message.ifBlank { text(Msg("notification.chat.image")) },
            type = ChatNotifier.TYPE_CHAT_MESSAGE,
            read = false,
            createdAt = latest.createdAt,
            link = "/chat?id=${conversation.id}",
            stammtischId = stammtischId
        )
    }

    private fun text(msg: Msg): String = Messages.defaultText(msg).trim()

    companion object {
        const val TYPE_DIRECT_MESSAGE = "direct_message"
        const val TYPE_FRIEND_REQUEST = "friend_request"
        const val TYPE_FRIEND_ACCEPTED = "friend_accepted"
        private const val FRIENDS_LINK = "/freunde"
        private val ACCEPTED_WINDOW: Duration = Duration.ofMinutes(15)
        private const val MAX_NOTIFICATIONS_PER_GROUP = 20
    }
}
