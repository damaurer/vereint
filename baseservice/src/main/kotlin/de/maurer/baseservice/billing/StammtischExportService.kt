package de.maurer.baseservice.billing

import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.PermissionDeniedException
import de.maurer.baseservice.repository.ChatMessageRepository
import de.maurer.baseservice.repository.ConversationRepository
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.MomentSessionRepository
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.StammtischRoleRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Instant

/**
 * Datenexport eines Stammtischs als JSON: Mitglieder, Rollen, Events,
 * Katalog, Buchungen, Chats und Moments. Verschlüsselte Inhalte (Chat,
 * Moments) liest JPA entschlüsselt. Bilder und Videos sind nicht enthalten,
 * nur ihre Zahl je Moment.
 *
 * Der Export bleibt auch erreichbar, wenn der Stammtisch nach einer offenen
 * Zahlung nur noch lesbar ist: Daten werden nie zurückgehalten.
 */
@Service
class StammtischExportService(
    private val stammtischRepository: StammtischRepository,
    private val memberRepository: StammtischMemberRepository,
    private val roleRepository: StammtischRoleRepository,
    private val userRoleRepository: UserRoleRepository,
    private val eventRepository: EventRepository,
    private val participantRepository: EventParticipantRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val conversationRepository: ConversationRepository,
    private val chatMessageRepository: ChatMessageRepository,
    private val momentSessionRepository: MomentSessionRepository,
    private val planLimits: PlanLimits,
    private val tenantTransactions: TenantTransactions,
    private val clock: Clock = Clock.systemUTC()
) {

    data class Export(val fileName: String, val content: Map<String, Any?>)

    fun export(principal: UserPrincipal): Export {
        if (!principal.hasPermission(Permission.STAMMTISCH_MANAGE) && !principal.hasPermission(Permission.BILLING_MANAGE)) {
            throw PermissionDeniedException(Msg("error.stammtisch.manageDenied"))
        }
        val stammtischId = TenantContext.requireStammtischId()
        return tenantTransactions.readInStammtisch(stammtischId) {
            val stammtisch = stammtischRepository.findById(stammtischId).orElseThrow()
            val subscription = planLimits.subscription(stammtischId)
            val rolesByUser = userRoleRepository.findAll().groupBy({ it.id.userId }, { it.id.role })
            val participantsByEvent = participantRepository.findAll().groupBy { it.event?.id }
            val messagesByConversation = chatMessageRepository.findAll().groupBy { it.conversation?.id }
            val now = Instant.now(clock)

            val content = linkedMapOf<String, Any?>(
                "format" to "vereint-stammtisch-export",
                "formatVersion" to 1,
                "exportedAt" to now,
                "stammtisch" to mapOf(
                    "id" to stammtisch.id,
                    "name" to stammtisch.name,
                    "createdAt" to stammtisch.createdAt,
                    "plan" to (subscription?.plan?.name ?: "free"),
                    "billingStatus" to (subscription?.status?.name ?: "none")
                ),
                "roles" to roleRepository.findAll().sortedBy { it.sortOrder }.map {
                    mapOf(
                        "code" to it.code,
                        "name" to it.name,
                        "description" to it.description,
                        "permissions" to it.permissionSet().sorted(),
                        "systemRole" to it.systemRole
                    )
                },
                "members" to memberRepository.findAllBy().map { member ->
                    val user = member.user
                    mapOf(
                        "userId" to user?.id,
                        "displayName" to user?.displayName,
                        "email" to user?.email,
                        "active" to member.active,
                        "boardRole" to member.boardRole?.name,
                        "roles" to rolesByUser[user?.id].orEmpty().sorted(),
                        "joinedAt" to member.joinedAt
                    )
                },
                "events" to eventRepository.findAll().sortedBy { it.startsAt }.map { event ->
                    mapOf(
                        "id" to event.id,
                        "title" to event.title,
                        "description" to event.description,
                        "location" to event.location,
                        "startsAt" to event.startsAt,
                        "endsAt" to event.endsAt,
                        "status" to event.status.name,
                        "ownerId" to event.owner?.id,
                        "participants" to participantsByEvent[event.id].orEmpty().map {
                            mapOf("userId" to it.user?.id, "role" to it.role, "rsvp" to it.rsvp.name)
                        }
                    )
                },
                "drinks" to drinkCatalogRepository.findAll().sortedBy { it.name }.map {
                    mapOf(
                        "id" to it.id,
                        "name" to it.name,
                        "category" to it.category,
                        "description" to it.description,
                        "price" to it.defaultPrice,
                        "costPrice" to it.costPrice,
                        "currency" to it.currency,
                        "active" to it.active,
                        "status" to it.status.name
                    )
                },
                "ledger" to ledgerEntryRepository.findAllByOrderByCreatedAtAsc().map {
                    mapOf(
                        "id" to it.id,
                        "type" to it.entryType.name,
                        "memberId" to it.member?.id,
                        "eventId" to it.event?.id,
                        "drink" to it.drink?.name,
                        "food" to it.food?.name,
                        "amount" to it.amount,
                        "currency" to it.currency,
                        "source" to it.source?.name,
                        "actorId" to it.actor?.id,
                        "reversesEntryId" to it.reversesEntry?.id,
                        "createdAt" to it.createdAt
                    )
                },
                "conversations" to conversationRepository.findAll().map { conversation ->
                    mapOf(
                        "id" to conversation.id,
                        "type" to conversation.type,
                        "title" to conversation.title,
                        "eventId" to conversation.event?.id,
                        "messages" to messagesByConversation[conversation.id].orEmpty().sortedBy { it.createdAt }.map {
                            mapOf(
                                "senderId" to it.sender?.id,
                                "guestName" to it.guest?.displayName,
                                "message" to it.message,
                                "createdAt" to it.createdAt
                            )
                        }
                    )
                },
                "moments" to momentSessionRepository.findAll().sortedBy { it.createdAt }.map {
                    mapOf(
                        "id" to it.id,
                        "eventId" to it.event?.id,
                        "creatorId" to it.creator?.id,
                        "title" to it.title,
                        "type" to it.topicType,
                        "message" to it.message,
                        "summary" to it.summary,
                        "createdAt" to it.createdAt
                    )
                }
            )
            val safeName = stammtisch.name.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').ifBlank { "stammtisch" }
            Export("vereint-$safeName-${now.toString().take(10)}.json", content)
        }
    }
}
