package de.maurer.baseservice.service

import de.maurer.baseservice.domain.FriendshipStatus
import de.maurer.baseservice.dto.NotificationDto
import de.maurer.baseservice.error.Messages
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.repository.DirectMessageRepository
import de.maurer.baseservice.repository.DirectParticipantRepository
import de.maurer.baseservice.repository.FriendshipRepository
import de.maurer.baseservice.security.UserPrincipal
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant

/**
 * Persönliche Mitteilungen für Web Push: ungelesene Direktnachrichten, offene
 * Freundschaftsanfragen und frisch angenommene Freundschaften.
 *
 * Pushes tragen keinen Inhalt. Der Service Worker lädt nach jedem Push neben
 * `/api/v1/notifications` (Mitteilungen der gewählten Gruppe) auch diese Liste
 * und zeigt die neueste ungelesene Mitteilung an. Die Einträge werden nicht
 * gespeichert, sondern aus den Daten berechnet: Eine Direktnachricht gilt als
 * erledigt, sobald das Gespräch gelesen ist, eine Anfrage, sobald sie
 * angenommen oder abgelehnt ist. Jeder Eintrag gehört nur dem Aufrufer.
 */
@Service
@Transactional(readOnly = true)
class PersonalAlertService(
    private val friendshipRepository: FriendshipRepository,
    private val participantRepository: DirectParticipantRepository,
    private val messageRepository: DirectMessageRepository,
    private val userService: UserService
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
        return (direct + friends).sortedByDescending { it.createdAt }
    }

    private fun text(msg: Msg): String = Messages.defaultText(msg).trim()

    companion object {
        const val TYPE_DIRECT_MESSAGE = "direct_message"
        const val TYPE_FRIEND_REQUEST = "friend_request"
        const val TYPE_FRIEND_ACCEPTED = "friend_accepted"
        private const val FRIENDS_LINK = "/freunde"
        private val ACCEPTED_WINDOW: Duration = Duration.ofMinutes(15)
    }
}
