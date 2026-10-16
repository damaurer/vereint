package de.maurer.baseservice.tenancy

import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.StammtischRoleRepository
import de.maurer.baseservice.repository.UserPermissionRepository
import de.maurer.baseservice.repository.UserRoleRepository
import org.springframework.stereotype.Service
import java.util.UUID

/** Eine aktive Mitgliedschaft samt Rollen und Berechtigungen in diesem Stammtisch. */
data class MembershipView(
    val stammtischId: UUID,
    val stammtischName: String,
    val roles: Set<String>,
    val permissions: Set<String>,
    val boardRole: String?
)

/**
 * Liest die Mitgliedschaften einer Person über alle Stammtische.
 *
 * Läuft ausschließlich im System-Kontext (siehe [memberships]), weil die
 * Auswahl des Stammtischs vor dem eigentlichen Stammtisch-Kontext passiert.
 * Die Methode gibt nur Daten der Person selbst heraus.
 */
@Service
class StammtischMemberships(
    private val stammtischRepository: StammtischRepository,
    private val memberRepository: StammtischMemberRepository,
    private val roleRepository: StammtischRoleRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userPermissionRepository: UserPermissionRepository
) {

    /** Jeder Repository-Aufruf öffnet eine eigene Sitzung im System-Kontext. */
    fun memberships(userId: UUID): List<MembershipView> = TenantContext.runAsSystem { load(userId) }

    private fun load(userId: UUID): List<MembershipView> {
        val members = memberRepository.findByUserIdAndActiveTrue(userId)
        if (members.isEmpty()) return emptyList()
        val stammtische = stammtischRepository.findAllById(members.mapNotNull { it.stammtischId })
            .filter { !it.archived }
            .associateBy { it.id }
        return members.mapNotNull { member ->
            val stammtisch = stammtische[member.stammtischId] ?: return@mapNotNull null
            val roles = userRoleRepository.findByStammtischIdAndIdUserId(stammtisch.id, userId).map { it.id.role }.toSet()
            val definitions = roleRepository.findByStammtischId(stammtisch.id).associate { it.code to it.permissionSet() }
            val custom = userPermissionRepository.findByStammtischIdAndIdUserId(stammtisch.id, userId)
                .map { it.id.permission }
            MembershipView(
                stammtischId = stammtisch.id,
                stammtischName = stammtisch.name,
                roles = roles,
                permissions = roles.flatMapTo(mutableSetOf()) { definitions[it].orEmpty() } + custom,
                boardRole = member.boardRole?.name
            )
        }.sortedBy { it.stammtischName.lowercase() }
    }
}
