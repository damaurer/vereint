package de.maurer.baseservice.service

import de.maurer.baseservice.dto.ChatUnreadCountDto
import de.maurer.baseservice.dto.ConversationSummaryDto
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischMemberships
import de.maurer.baseservice.tenancy.TenantTransactions
import org.springframework.stereotype.Service
import java.time.Instant

/**
 * Gemeinsame Chat-Liste über alle eigenen Gruppen, wie bei bekannten Messengern:
 * Gruppenchats, Event-Chats und Direktnachrichten in einer Liste, neueste
 * Nachricht zuerst.
 *
 * Gruppen- und Event-Chats bleiben Teil ihrer Gruppe. Die Liste liest sie je
 * Gruppe, in der die Person aktives Mitglied ist, in einer eigenen Transaktion
 * im Kontext genau dieser Gruppe (Hibernate-Filter und Row-Level-Security
 * greifen wie bei jeder anderen Anfrage). Sichtbar ist dasselbe wie im
 * Gruppenchat der Gruppe: der Gruppenchat und die Event-Chats eigener bzw.
 * eingeladener Events ([ConversationService.listConversations]). Dazu kommen
 * die gruppenübergreifenden Direktnachrichten ([DirectMessageService.list]).
 */
@Service
class ChatOverviewService(
    private val userService: UserService,
    private val memberships: StammtischMemberships,
    private val tenantTransactions: TenantTransactions,
    private val conversationService: ConversationService,
    private val directMessageService: DirectMessageService,
    private val eventVisibility: EventVisibility
) {

    fun overview(principal: UserPrincipal): List<ConversationSummaryDto> {
        val caller = userService.getOrCreateUser(principal)
        val groupChats = memberships.memberships(caller.id).flatMap { membership ->
            val groupPrincipal = eventVisibility.groupPrincipal(principal, membership)
            // Schreibend, weil der Gruppenchat beim ersten Zugriff angelegt und die Zustellung vermerkt wird.
            tenantTransactions.inStammtisch(membership.stammtischId) {
                conversationService.listConversations(groupPrincipal)
            }.map { it.copy(stammtischId = membership.stammtischId.toString(), stammtischName = membership.stammtischName) }
        }
        val directs = directMessageService.list(principal)
        return (groupChats + directs).sortedWith(
            compareByDescending<ConversationSummaryDto> { it.lastMessage?.createdAt ?: Instant.EPOCH }
                // Ohne Nachricht: Gruppenchats vor Event-Chats vor Direktnachrichten, dann nach Name.
                .thenBy { TYPE_ORDER[it.type] ?: TYPE_ORDER.size }
                .thenBy { it.title.lowercase() }
        )
    }

    /** Ungelesene Nachrichten über alle Chats der Liste. */
    fun unreadCount(principal: UserPrincipal): ChatUnreadCountDto =
        ChatUnreadCountDto(unread = overview(principal).sumOf { it.unreadCount })

    private companion object {
        val TYPE_ORDER = mapOf(
            ConversationService.TYPE_CLUB to 0,
            ConversationService.TYPE_EVENT to 1,
            ConversationService.TYPE_DIRECT to 2
        )
    }
}
