package de.maurer.baseservice.tenancy

import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.StammtischMemberRepository
import org.springframework.stereotype.Component
import java.util.UUID

/** Eine Gruppe, in der beide Personen aktive Mitglieder sind. */
data class SharedGroup(val id: UUID, val name: String)

/** Eine andere Person aus den eigenen Gruppen samt den gemeinsamen Gruppen. */
data class GroupContact(val user: UserEntity, val groups: List<SharedGroup>)

/**
 * Personen, mit denen man eine Gruppe teilt, über alle eigenen Gruppen.
 *
 * Grundlage für Freundschaftsanfragen und Direktnachrichten. Liest im
 * System-Kontext, gibt aber nur Personen aus Gruppen heraus, in denen die
 * fragende Person selbst aktives Mitglied ist, und nennt nur diese Gruppen.
 * Personen aus fremden Gruppen bleiben unsichtbar.
 */
@Component
class SharedGroups(
    private val memberships: StammtischMemberships,
    private val memberRepository: StammtischMemberRepository,
    private val tenantTransactions: TenantTransactions
) {

    /** Alle anderen aktiven Mitglieder der eigenen Gruppen mit aktivem Konto. */
    fun contactsOf(userId: UUID): List<GroupContact> {
        val own = memberships.memberships(userId).associate { it.stammtischId to it.stammtischName }
        if (own.isEmpty()) return emptyList()
        val members = tenantTransactions.readAsSystem {
            memberRepository.findByStammtischIdInAndActiveTrue(own.keys)
                .mapNotNull { member -> member.user?.let { it to member.stammtischId } }
                // Innerhalb der Transaktion laden; danach ist die Sitzung zu.
                .onEach { (user, _) -> user.displayName }
        }
        return members
            .filter { (user, _) -> user.id != userId && !user.disabled }
            .groupBy({ it.first.id }, { it })
            .map { (_, entries) ->
                GroupContact(
                    user = entries.first().first,
                    groups = entries.mapNotNull { (_, groupId) -> groupId?.let { id -> own[id]?.let { SharedGroup(id, it) } } }
                        .distinctBy { it.id }
                        .sortedBy { it.name.lowercase() }
                )
            }
            .sortedBy { it.user.displayName.lowercase() }
    }

    /** Gemeinsame Gruppen zweier Personen; leer, wenn sie keine Gruppe teilen. */
    fun between(userId: UUID, otherId: UUID): List<SharedGroup> =
        contactsOf(userId).firstOrNull { it.user.id == otherId }?.groups.orEmpty()
}
