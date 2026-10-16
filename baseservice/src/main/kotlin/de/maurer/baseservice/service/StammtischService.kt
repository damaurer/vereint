package de.maurer.baseservice.service

import de.maurer.baseservice.domain.StammtischRoleEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.SaveStammtischRoleRequest
import de.maurer.baseservice.dto.StammtischDto
import de.maurer.baseservice.dto.StammtischMembershipDto
import de.maurer.baseservice.dto.StammtischRoleDto
import de.maurer.baseservice.dto.StammtischRolesDto
import de.maurer.baseservice.dto.UpdateStammtischRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.StammtischRoleRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.StammtischManagers
import de.maurer.baseservice.tenancy.StammtischMemberships
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Der aktuelle Stammtisch: Einstellungen, eigene Rollen, Austritt.
 *
 * Alle Methoden außer [myStammtische] laufen im Kontext des gewählten
 * Stammtischs; Hibernate und die Datenbank sehen nur dessen Zeilen.
 */
@Service
@Transactional
class StammtischService(
    private val stammtischRepository: StammtischRepository,
    private val memberRepository: StammtischMemberRepository,
    private val roleRepository: StammtischRoleRepository,
    private val userRoleRepository: UserRoleRepository,
    private val memberships: StammtischMemberships,
    private val membershipService: MembershipService,
    private val access: StammtischAccess,
    private val managers: StammtischManagers,
    private val userService: UserService,
    private val auditService: AuditService
) {

    /** Alle Stammtische, in denen die Person aktives Mitglied ist. */
    @Transactional(readOnly = true)
    fun myStammtische(principal: UserPrincipal): List<StammtischMembershipDto> {
        val caller = userService.getOrCreateUser(principal)
        return memberships.memberships(caller.id).map {
            StammtischMembershipDto(it.stammtischId.toString(), it.stammtischName, it.roles, it.boardRole, it.imageVersion)
        }
    }

    @Transactional(readOnly = true)
    fun current(principal: UserPrincipal): StammtischDto {
        val caller = userService.getOrCreateUser(principal)
        val stammtisch = currentEntity()
        return StammtischDto(
            id = stammtisch.id.toString(),
            name = stammtisch.name,
            memberCount = memberRepository.countByActiveTrue(),
            myRoles = access.rolesOf(principal, caller),
            myPermissions = access.permissionsOf(principal, caller),
            createdAt = stammtisch.createdAt,
            imageVersion = stammtisch.imageVersion.takeIf { stammtisch.imageKey != null }
        )
    }

    fun rename(request: UpdateStammtischRequest, principal: UserPrincipal): StammtischDto {
        val caller = userService.getOrCreateUser(principal)
        require(principal, caller, Permission.STAMMTISCH_MANAGE)
        val name = request.name?.trim().orEmpty()
        if (name.isBlank()) {
            throw InvalidRequestException(Msg("error.stammtisch.nameBlank"), ErrorCode.INVALID_REQUEST)
        }
        val stammtisch = currentEntity()
        val previous = stammtisch.name
        stammtisch.name = name.take(MAX_NAME_LENGTH)
        stammtischRepository.save(stammtisch)
        auditService.recordStammtischChange(caller, AuditService.ACTION_STAMMTISCH_RENAMED, stammtisch.id, "$previous -> ${stammtisch.name}")
        return current(principal)
    }

    /** Eigener Austritt. Buchungen bleiben erhalten; der letzte Verwaltungszugang kann nicht austreten. */
    fun leave(principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        managers.requireRemaining(leaving = setOf(caller.id))
        membershipService.deactivate(caller)
        auditService.recordUserChange(caller, AuditService.ACTION_MEMBER_LEFT, caller.id, true, false)
    }

    // --- Rollen ---

    @Transactional(readOnly = true)
    fun roles(principal: UserPrincipal): StammtischRolesDto {
        val caller = userService.getOrCreateUser(principal)
        if (!access.hasAny(principal, caller, Permission.ROLES_MANAGE, Permission.MEMBERS_READ)) {
            throw AccessDeniedException(Msg("error.stammtisch.rolesDenied"), ErrorCode.ACCESS_DENIED)
        }
        val counts = userRoleRepository.findAll().groupingBy { it.id.role }.eachCount()
        return StammtischRolesDto(
            roles = roleRepository.findAllByOrderBySortOrderAscNameAsc().map { toDto(it, counts[it.code] ?: 0) },
            knownPermissions = RolePermissionMatrix.KNOWN_PERMISSIONS
        )
    }

    fun createRole(request: SaveStammtischRoleRequest, principal: UserPrincipal): StammtischRoleDto {
        val caller = userService.getOrCreateUser(principal)
        require(principal, caller, Permission.ROLES_MANAGE)
        val name = requireName(request.name)
        val code = normalizeCode(request.code?.takeIf { it.isNotBlank() } ?: name)
        if (roleRepository.findByCode(code).isPresent) {
            throw InvalidRequestException(Msg("error.stammtisch.roleCodeTaken", code), ErrorCode.INVALID_REQUEST)
        }
        val role = StammtischRoleEntity(
            code = code,
            name = name,
            description = request.description?.trim()?.ifBlank { null },
            systemRole = false,
            sortOrder = request.sortOrder ?: ((roleRepository.findAll().maxOfOrNull { it.sortOrder } ?: 0) + 10)
        )
        role.assignPermissions(requirePermissions(request.permissions.orEmpty()))
        val saved = roleRepository.saveAndFlush(role)
        changed(caller, saved, "created")
        return toDto(saved, 0)
    }

    fun updateRole(id: UUID, request: SaveStammtischRoleRequest, principal: UserPrincipal): StammtischRoleDto {
        val caller = userService.getOrCreateUser(principal)
        require(principal, caller, Permission.ROLES_MANAGE)
        val role = requireRole(id)
        request.name?.let { role.name = requireName(it) }
        request.description?.let { role.description = it.trim().ifBlank { null } }
        request.sortOrder?.let { role.sortOrder = it }
        if (request.permissions != null) {
            val permissions = requirePermissions(request.permissions)
            managers.requireRemaining(definitions = access.roleDefinitions() + (role.code to permissions))
            role.assignPermissions(permissions)
        }
        val saved = roleRepository.saveAndFlush(role)
        changed(caller, saved, "updated")
        return toDto(saved, userRoleRepository.findByIdRole(saved.code).size)
    }

    /** Löscht eine eigene Rolle; Personen verlieren sie. Systemrollen bleiben. */
    fun deleteRole(id: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        require(principal, caller, Permission.ROLES_MANAGE)
        val role = requireRole(id)
        if (role.systemRole) {
            throw InvalidRequestException(Msg("error.stammtisch.systemRoleDelete"), ErrorCode.INVALID_REQUEST)
        }
        managers.requireRemaining(definitions = access.roleDefinitions() - role.code)
        userRoleRepository.deleteByIdRole(role.code)
        userRoleRepository.flush()
        roleRepository.delete(role)
        roleRepository.flush()
        changed(caller, role, "deleted")
    }

    private fun changed(caller: UserEntity, role: StammtischRoleEntity, what: String) {
        access.invalidateRoles(TenantContext.requireStammtischId())
        auditService.recordStammtischChange(
            caller,
            AuditService.ACTION_STAMMTISCH_ROLE_CHANGED,
            role.id,
            "$what code=${role.code}; permissions=${role.permissions}"
        )
    }

    private fun currentEntity() = stammtischRepository.findById(TenantContext.requireStammtischId()).orElseThrow {
        ResourceNotFoundException(Msg("error.stammtisch.notFound"), ErrorCode.NOT_FOUND)
    }

    private fun requireRole(id: UUID): StammtischRoleEntity = roleRepository.findById(id).orElseThrow {
        ResourceNotFoundException(Msg("error.stammtisch.roleNotFound", id), ErrorCode.NOT_FOUND)
    }

    private fun require(principal: UserPrincipal, caller: UserEntity, permission: String) =
        access.require(principal, caller, permission, Msg("error.stammtisch.manageDenied"))

    private fun requireName(value: String?): String {
        val name = value?.trim().orEmpty()
        if (name.isBlank()) {
            throw InvalidRequestException(Msg("error.stammtisch.roleNameBlank"), ErrorCode.INVALID_REQUEST)
        }
        return name.take(MAX_ROLE_NAME_LENGTH)
    }

    private fun requirePermissions(values: Collection<String>): Set<String> {
        val permissions = values.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        val unknown = permissions.filter { it !in RolePermissionMatrix.KNOWN_PERMISSIONS }
        if (unknown.isNotEmpty()) {
            throw InvalidRequestException(Msg("error.user.invalidPermissions", unknown), ErrorCode.INVALID_REQUEST)
        }
        return permissions
    }

    /** Code aus Name oder Eingabe: Kleinbuchstaben, Ziffern und Bindestriche. */
    private fun normalizeCode(value: String): String {
        val code = value.trim().lowercase()
            .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
            .replace(Regex("[^a-z0-9]+"), "-")
            .trim('-')
            .take(MAX_ROLE_NAME_LENGTH)
        if (code.isBlank() || code in RESERVED_CODES) {
            throw InvalidRequestException(Msg("error.stammtisch.roleCodeInvalid", value), ErrorCode.INVALID_REQUEST)
        }
        return code
    }

    private fun toDto(role: StammtischRoleEntity, memberCount: Int) = StammtischRoleDto(
        id = role.id.toString(),
        code = role.code,
        name = role.name,
        description = role.description,
        permissions = role.permissionSet(),
        systemRole = role.systemRole,
        sortOrder = role.sortOrder,
        memberCount = memberCount
    )

    companion object {
        const val MAX_NAME_LENGTH = 80
        const val MAX_ROLE_NAME_LENGTH = 64

        /** Codes der Systemrollen (auch klein geschrieben) sind für eigene Rollen gesperrt. */
        private val RESERVED_CODES = RolePermissionMatrix.SYSTEM_ROLES.map { it.lowercase() }.toSet()
    }
}
