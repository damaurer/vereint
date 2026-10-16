package de.maurer.baseservice.tenancy

import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.LastAdminProtectedException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.UserPermissionRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.Permission
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Sorgt dafür, dass ein Stammtisch verwaltbar bleibt: Nach jeder Änderung an
 * Rollen, Rollenzuweisungen oder Mitgliedschaften muss mindestens ein aktives
 * Mitglied Mitglieder oder Rollen verwalten können.
 */
@Component
class StammtischManagers(
    private val access: StammtischAccess,
    private val memberRepository: StammtischMemberRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userPermissionRepository: UserPermissionRepository
) {

    /**
     * Prüft den Zustand nach einer geplanten Änderung. Abgelehnt wird nur eine
     * Änderung, die den letzten Verwaltungszugang entfernt; ein Stammtisch, der
     * schon vorher niemanden mit Verwaltungsrechten hatte, wird nicht blockiert.
     *
     * @param definitions Rollendefinitionen nach der Änderung
     * @param assignments Rollen je Person nach der Änderung (nur geänderte Personen)
     * @param leaving Personen, die nach der Änderung kein aktives Mitglied mehr sind
     */
    fun requireRemaining(
        definitions: Map<String, Set<String>> = access.roleDefinitions(),
        assignments: Map<UUID, Set<String>> = emptyMap(),
        leaving: Set<UUID> = emptySet()
    ) {
        if (countManagers(definitions, assignments, leaving) == 0 &&
            countManagers(access.roleDefinitions(), emptyMap(), emptySet()) > 0
        ) {
            throw LastAdminProtectedException(
                Msg("error.stammtisch.lastManager"),
                ErrorCode.LAST_ROLE_MANAGER_PROTECTED
            )
        }
    }

    /** Ob die Person derzeit Mitglieder oder Rollen verwalten kann. */
    fun isManager(userId: UUID): Boolean {
        val definitions = access.roleDefinitions()
        val roles = userRoleRepository.findByIdUserId(userId).map { it.id.role }
        val custom = userPermissionRepository.findByIdUserId(userId).map { it.id.permission }
        return (roles.flatMap { definitions[it].orEmpty() } + custom).any { it in MANAGER_PERMISSIONS }
    }

    private fun countManagers(
        definitions: Map<String, Set<String>>,
        assignments: Map<UUID, Set<String>>,
        leaving: Set<UUID>
    ): Int {
        val active = memberRepository.findByActiveTrue()
            .filter { it.user?.disabled == false }
            .mapNotNull { it.user?.id }
            .filter { it !in leaving }
            .toSet()
        val roles = userRoleRepository.findAll().groupBy({ it.id.userId }, { it.id.role })
        val custom = userPermissionRepository.findAll().groupBy({ it.id.userId }, { it.id.permission })
        return active.count { userId ->
            val userRoles = assignments[userId] ?: roles[userId].orEmpty().toSet()
            val permissions = userRoles.flatMap { definitions[it].orEmpty() } + custom[userId].orEmpty()
            permissions.any { it in MANAGER_PERMISSIONS }
        }
    }

    companion object {
        val MANAGER_PERMISSIONS = setOf(Permission.MEMBERS_MANAGE, Permission.ROLES_MANAGE)
    }
}
