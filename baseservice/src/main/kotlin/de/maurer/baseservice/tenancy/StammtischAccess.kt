package de.maurer.baseservice.tenancy

import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.repository.StammtischRoleRepository
import de.maurer.baseservice.repository.UserPermissionRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import org.springframework.stereotype.Component
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Berechtigungen einer Person im aktuellen Stammtisch.
 *
 * Effektive Berechtigungen = Berechtigungen aller Rollen der Person in diesem
 * Stammtisch (`user_roles` → `stammtisch_roles.permissions`) plus individuell
 * vergebene (`user_permissions`) plus die bereits im Principal aufgelösten.
 * Keycloak-Rollen aus dem Token zählen hier nicht: der
 * [StammtischContextFilter] ersetzt sie durch die Rollen des Stammtischs.
 */
@Component
class StammtischAccess(
    private val stammtischRoleRepository: StammtischRoleRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userPermissionRepository: UserPermissionRepository
) {

    /** Rollen-Code → Berechtigungen je Stammtisch; wird bei Rollenänderungen verworfen. */
    private val roleCache = ConcurrentHashMap<UUID, Map<String, Set<String>>>()

    /** Rollen-Codes der Person im aktuellen Stammtisch (Principal und Datenbank). */
    fun rolesOf(principal: UserPrincipal, caller: UserEntity?): Set<String> {
        val dbRoles = caller?.let { user -> userRoleRepository.findByIdUserId(user.id).map { it.id.role } }.orEmpty()
        return principal.roles + dbRoles
    }

    fun permissionsOf(principal: UserPrincipal, caller: UserEntity?): Set<String> {
        val roles = rolesOf(principal, caller)
        val custom = caller?.let { user -> userPermissionRepository.findByIdUserId(user.id).map { it.id.permission } }
            .orEmpty()
        return principal.permissions + permissionsForRoles(roles) + custom
    }

    fun has(principal: UserPrincipal, caller: UserEntity?, permission: String): Boolean =
        permissionsOf(principal, caller).contains(permission)

    fun hasAny(principal: UserPrincipal, caller: UserEntity?, vararg permissions: String): Boolean {
        val granted = permissionsOf(principal, caller)
        return permissions.any { granted.contains(it) }
    }

    /**
     * Reguläres Mitglied des Stammtischs (nicht nur Thekenkonto): hat die
     * Grundrechte eines Mitglieds.
     */
    fun isMember(principal: UserPrincipal, caller: UserEntity?): Boolean =
        has(principal, caller, Permission.PROFILE_READ_SELF)

    fun require(principal: UserPrincipal, caller: UserEntity?, permission: String, msg: Msg) {
        if (!has(principal, caller, permission)) {
            throw AccessDeniedException(msg, ErrorCode.ACCESS_DENIED)
        }
    }

    /** Berechtigungen der angegebenen Rollen-Codes im aktuellen Stammtisch. */
    fun permissionsForRoles(roles: Collection<String>): Set<String> {
        if (roles.isEmpty()) return emptySet()
        val definitions = roleDefinitions()
        return roles.flatMapTo(mutableSetOf()) { definitions[it].orEmpty() }
    }

    fun roleDefinitions(): Map<String, Set<String>> {
        val stammtischId = TenantContext.stammtischId() ?: return emptyMap()
        return roleCache.computeIfAbsent(stammtischId) {
            stammtischRoleRepository.findAll().associate { it.code to it.permissionSet() }
        }
    }

    fun invalidateRoles(stammtischId: UUID) {
        roleCache.remove(stammtischId)
    }
}
