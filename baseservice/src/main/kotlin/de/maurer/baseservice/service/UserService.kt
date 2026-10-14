package de.maurer.baseservice.service

import de.maurer.baseservice.domain.AssignedRole
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.domain.UserPermissionEntity
import de.maurer.baseservice.domain.UserPermissionId
import de.maurer.baseservice.domain.UserRoleEntity
import de.maurer.baseservice.domain.UserRoleId
import de.maurer.baseservice.domain.BoardRole as DomainBoardRole
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.*
import de.maurer.baseservice.repository.UserPermissionRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.BoardRole
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import jakarta.persistence.criteria.Predicate
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
@Transactional
class UserService(
    private val userRepository: UserRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userPermissionRepository: UserPermissionRepository,
    private val userProvisioningService: UserProvisioningService,
    private val permissionCache: UserPermissionCache,
    private val auditService: AuditService
) {

    /**
     * Liest oder legt das Profil zur Keycloak-Identität an.
     *
     * Nebenläufige Erstanfragen derselben Person führen im Verlierer zu einer
     * `DataIntegrityViolationException`; in diesem Fall wird erneut gelesen.
     */
    fun getOrCreateUser(principal: UserPrincipal): UserEntity {
        if (principal.subject.isBlank()) {
            throw AccessDeniedException(Msg("error.user.subjectRequired"), ErrorCode.ACCESS_DENIED)
        }

        userRepository.findByKeycloakSubject(principal.subject).orElse(null)?.let { return requireEnabled(it) }

        val created = try {
            userProvisioningService.createUser(principal)
        } catch (ex: DataIntegrityViolationException) {
            userRepository.findByKeycloakSubject(principal.subject).orElseThrow {
                ProfileNotFoundException(
                    Msg("error.user.provisioningFailed", ex.javaClass.simpleName),
                    ErrorCode.PROFILE_NOT_FOUND
                )
            }
        }

        permissionCache.invalidate(created.id)
        return requireEnabled(created)
    }

    private fun requireEnabled(user: UserEntity): UserEntity {
        if (user.disabled) {
            throw AccountDisabledException(Msg("error.user.disabled"), ErrorCode.ACCOUNT_DISABLED)
        }
        return user
    }

    @Transactional(readOnly = true)
    fun getProfile(principal: UserPrincipal): UserProfileDto {
        val user = getOrCreateUser(principal)
        return toProfileDto(user)
    }

    fun updateProfile(principal: UserPrincipal, request: UpdateProfileRequest): UserProfileDto {
        val user = getOrCreateUser(principal)

        var updated = false
        if (request.displayName != null) {
            val name = request.displayName.trim()
            if (name.isBlank()) {
                throw InvalidRequestException(Msg("error.user.displayNameBlank"), ErrorCode.INVALID_REQUEST)
            }
            user.displayName = name
            updated = true
        }

        if (request.email != null) {
            user.email = request.email.trim().ifBlank { null }
            updated = true
        }

        if (updated) {
            userRepository.save(user)
        }

        return toProfileDto(user)
    }

    /**
     * `deny by default`: Nicht-Administratoren erhalten weder Zugriff auf fremde
     * noch auf deaktivierte Profile; Statusinformationen werden dabei nicht preisgegeben.
     */
    @Transactional(readOnly = true)
    fun getUserById(id: UUID, principal: UserPrincipal): UserProfileDto {
        val callerUser = getOrCreateUser(principal)
        val isAdmin = isAdmin(principal, callerUser)

        val user = userRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.user.notFound", id), ErrorCode.NOT_FOUND)
        }

        val isSelf = callerUser.id == user.id || callerUser.keycloakSubject == user.keycloakSubject

        if (!isAdmin && !isSelf) {
            throw AccessDeniedException(Msg("error.user.profileViewDenied"), ErrorCode.ACCESS_DENIED)
        }

        if (!isAdmin && user.disabled) {
            throw AccessDeniedException(Msg("error.user.profileViewDenied"), ErrorCode.ACCESS_DENIED)
        }

        return toProfileDto(user)
    }

    /**
     * Paginierte, gefilterte und sortierte Benutzerliste für Vorstand und Administration.
     */
    @Transactional(readOnly = true)
    fun listUsers(
        role: String?,
        disabled: Boolean?,
        search: String?,
        pageable: Pageable?,
        principal: UserPrincipal
    ): PagedResponse<UserSummaryDto> {
        val callerUser = getOrCreateUser(principal)
        if (!isBoardOrAdmin(principal, callerUser)) {
            throw AccessDeniedException(
                Msg("error.user.listDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }

        if (role != null && !RolePermissionMatrix.ASSIGNABLE_ROLES.contains(role)) {
            throw InvalidRequestException(Msg("error.user.invalidRoleFilter", role), ErrorCode.INVALID_REQUEST)
        }

        val effectivePageable = normalizePageable(pageable)
        val page: Page<UserEntity> = userRepository.findAll(
            userSpecification(role, disabled, search),
            effectivePageable
        )

        val content = page.content.map { user ->
            val roles = rolesOf(user.id)
            UserSummaryDto(
                id = user.id.toString(),
                keycloakSubject = user.keycloakSubject,
                displayName = user.displayName,
                email = user.email,
                disabled = user.disabled,
                drinkRecorder = user.drinkRecorder,
                boardRole = user.boardRole?.name,
                roles = roles,
                createdAt = user.createdAt
            )
        }

        return PagedResponse(
            content = content,
            page = page.number,
            size = page.size,
            totalElements = page.totalElements,
            totalPages = page.totalPages,
            sort = effectivePageable.sort.map { "${it.property},${it.direction.name.lowercase()}" }.toList()
        )
    }

    fun adminUpdateUser(id: UUID, request: AdminUpdateUserRequest, principal: UserPrincipal): UserProfileDto {
        val callerUser = getOrCreateUser(principal)
        requireAdmin(principal, callerUser)

        val user = userRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.user.notFound", id), ErrorCode.NOT_FOUND)
        }

        val touchesPrivileges = request.roles != null || request.permissions != null || request.disabled != null
        if (touchesPrivileges) {
            requireNotSelf(callerUser, user)
        }

        var updated = false

        if (request.displayName != null) {
            val name = request.displayName.trim()
            if (name.isBlank()) {
                throw InvalidRequestException(Msg("error.user.displayNameBlank"), ErrorCode.INVALID_REQUEST)
            }
            user.displayName = name
            updated = true
        }

        if (request.email != null) {
            user.email = request.email.trim().ifBlank { null }
            updated = true
        }

        if (request.disabled != null && request.disabled != user.disabled) {
            if (request.disabled) {
                requireRemainingAdmin(user)
            }
            val previous = user.disabled
            user.disabled = request.disabled
            updated = true
            auditService.recordUserChange(
                callerUser,
                AuditService.ACTION_STATUS_CHANGED,
                user.id,
                previous,
                request.disabled
            )
        }

        if (request.drinkRecorder != null) {
            user.drinkRecorder = request.drinkRecorder
            updated = true
        }

        if (request.boardRole != null) {
            val boardRole = request.boardRole.trim()
            if (boardRole.isNotBlank() && !BoardRole.ALL.contains(boardRole)) {
                throw InvalidRequestException(Msg("error.user.invalidBoardRole", boardRole), ErrorCode.INVALID_REQUEST)
            }
            user.boardRole = DomainBoardRole.fromValue(boardRole)
            updated = true
        }

        if (updated) {
            userRepository.save(user)
            auditService.recordUserChange(
                callerUser,
                AuditService.ACTION_PROFILE_ADMIN_UPDATED,
                user.id,
                null,
                "displayName=${user.displayName}; disabled=${user.disabled}; boardRole=${user.boardRole?.name}"
            )
        }

        if (request.roles != null) {
            setRolesForUser(callerUser, user, request.roles)
        }

        if (request.permissions != null) {
            setPermissionsForUser(callerUser, user, request.permissions)
        }

        permissionCache.invalidate(user.id)
        return toProfileDto(user)
    }

    fun assignRoles(id: UUID, roles: Set<String>, principal: UserPrincipal): UserProfileDto {
        val callerUser = getOrCreateUser(principal)
        requireAdmin(principal, callerUser)

        val user = userRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.user.notFound", id), ErrorCode.NOT_FOUND)
        }
        requireNotSelf(callerUser, user)

        setRolesForUser(callerUser, user, roles)
        userRepository.save(user)
        permissionCache.invalidate(user.id)
        return toProfileDto(user)
    }

    fun assignPermissions(id: UUID, permissions: Set<String>, principal: UserPrincipal): UserProfileDto {
        val callerUser = getOrCreateUser(principal)
        requireAdmin(principal, callerUser)

        val user = userRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.user.notFound", id), ErrorCode.NOT_FOUND)
        }
        requireNotSelf(callerUser, user)

        setPermissionsForUser(callerUser, user, permissions)
        userRepository.save(user)
        permissionCache.invalidate(user.id)
        return toProfileDto(user)
    }

    fun setUserStatus(id: UUID, disabled: Boolean, principal: UserPrincipal): UserProfileDto {
        val callerUser = getOrCreateUser(principal)
        requireAdmin(principal, callerUser)

        val user = userRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.user.notFound", id), ErrorCode.NOT_FOUND)
        }
        requireNotSelf(callerUser, user)

        if (disabled) {
            requireRemainingAdmin(user)
        }

        val previous = user.disabled
        user.disabled = disabled
        userRepository.save(user)
        permissionCache.invalidate(user.id)

        auditService.recordUserChange(
            callerUser,
            AuditService.ACTION_STATUS_CHANGED,
            user.id,
            previous,
            disabled
        )
        return toProfileDto(user)
    }

    private fun normalizePageable(pageable: Pageable?): Pageable {
        val requested = pageable ?: Pageable.unpaged()
        val size = when {
            requested.isUnpaged -> DEFAULT_PAGE_SIZE
            requested.pageSize <= 0 -> DEFAULT_PAGE_SIZE
            requested.pageSize > MAX_PAGE_SIZE -> MAX_PAGE_SIZE
            else -> requested.pageSize
        }
        val pageNumber = if (requested.isUnpaged) 0 else requested.pageNumber.coerceAtLeast(0)
        val sort = if (requested.isUnpaged || requested.sort.isUnsorted) DEFAULT_SORT else requested.sort
        return PageRequest.of(pageNumber, size, sort)
    }

    private fun userSpecification(role: String?, disabled: Boolean?, search: String?): Specification<UserEntity> =
        Specification { root, query, builder ->
            val predicates = mutableListOf<Predicate>()

            if (disabled != null) {
                predicates.add(builder.equal(root.get<Boolean>("disabled"), disabled))
            }

            if (!search.isNullOrBlank()) {
                val term = "%${search.trim().lowercase()}%"
                predicates.add(
                    builder.or(
                        builder.like(builder.lower(root.get<String>("displayName")), term),
                        builder.like(builder.lower(builder.coalesce(root.get<String>("email"), "")), term)
                    )
                )
            }

            if (role != null) {
                val subquery = query?.subquery(UUID::class.java)
                if (subquery != null) {
                    val roleRoot = subquery.from(UserRoleEntity::class.java)
                    subquery.select(roleRoot.get<UserRoleId>("id").get<UUID>("userId"))
                    subquery.where(
                        builder.and(
                            builder.equal(
                                roleRoot.get<UserRoleId>("id").get<AssignedRole>("role"),
                                AssignedRole.fromValue(role)
                            ),
                            builder.equal(roleRoot.get<UserRoleId>("id").get<UUID>("userId"), root.get<UUID>("id"))
                        )
                    )
                    predicates.add(builder.exists(subquery))
                }
            }

            if (predicates.isEmpty()) null else builder.and(*predicates.toTypedArray())
        }

    private fun setRolesForUser(actor: UserEntity, user: UserEntity, roles: Set<String>) {
        val invalidRoles = roles.filter { !RolePermissionMatrix.ASSIGNABLE_ROLES.contains(it) }
        if (invalidRoles.isNotEmpty()) {
            throw InvalidRequestException(Msg("error.user.invalidRoles", invalidRoles), ErrorCode.INVALID_REQUEST)
        }

        val previousRoles = rolesOf(user.id)
        if (previousRoles.contains(UserRole.ADMIN) && !roles.contains(UserRole.ADMIN)) {
            requireRemainingAdmin(user)
        }

        userRoleRepository.deleteByIdUserId(user.id)
        userRoleRepository.flush()

        roles.forEach { role ->
            userRoleRepository.save(UserRoleEntity(UserRoleId(user.id, AssignedRole.valueOf(role)), user))
        }
        userRoleRepository.flush()
        permissionCache.invalidate(user.id)

        auditService.recordUserChange(
            actor,
            AuditService.ACTION_ROLES_CHANGED,
            user.id,
            previousRoles,
            roles
        )
    }

    private fun setPermissionsForUser(actor: UserEntity, user: UserEntity, permissions: Set<String>) {
        val previousPermissions = userPermissionRepository.findByIdUserId(user.id).map { it.id.permission }.toSet()

        userPermissionRepository.deleteByIdUserId(user.id)
        userPermissionRepository.flush()

        val effective = permissions.filter { it.isNotBlank() }.toSet()
        effective.forEach { permission ->
            userPermissionRepository.save(UserPermissionEntity(UserPermissionId(user.id, permission), user))
        }
        userPermissionRepository.flush()
        permissionCache.invalidate(user.id)

        auditService.recordUserChange(
            actor,
            AuditService.ACTION_PERMISSIONS_CHANGED,
            user.id,
            previousPermissions,
            effective
        )
    }

    /** Selbstzuweisung von Rechten und Selbstdeaktivierung sind ausgeschlossen. */
    private fun requireNotSelf(callerUser: UserEntity, target: UserEntity) {
        if (callerUser.id == target.id || callerUser.keycloakSubject == target.keycloakSubject) {
            throw SelfPrivilegeChangeDeniedException(
                Msg("error.user.selfPrivilegeChange"),
                ErrorCode.SELF_PRIVILEGE_CHANGE_DENIED
            )
        }
    }

    /** Es muss immer mindestens ein aktives Adminkonto verbleiben. */
    private fun requireRemainingAdmin(target: UserEntity) {
        val targetIsActiveAdmin = !target.disabled && rolesOf(target.id).contains(UserRole.ADMIN)
        if (!targetIsActiveAdmin) {
            return
        }
        if (userRepository.countActiveUsersWithRole(AssignedRole.admin) <= 1) {
            throw LastAdminProtectedException(
                Msg("error.user.lastAdmin"),
                ErrorCode.LAST_ADMIN_PROTECTED
            )
        }
    }

    private fun requireAdmin(principal: UserPrincipal, callerUser: UserEntity) {
        if (!isAdmin(principal, callerUser)) {
            throw AccessDeniedException(Msg("error.user.adminRequired"), ErrorCode.ACCESS_DENIED)
        }
    }

    private fun isAdmin(principal: UserPrincipal, callerUser: UserEntity): Boolean {
        if (principal.roles.contains(UserRole.ADMIN)) return true
        return rolesOf(callerUser.id).contains(UserRole.ADMIN)
    }

    private fun isBoardOrAdmin(principal: UserPrincipal, callerUser: UserEntity): Boolean {
        if (isAdmin(principal, callerUser)) return true
        if (principal.roles.contains(UserRole.BOARD)) return true
        return rolesOf(callerUser.id).contains(UserRole.BOARD)
    }

    /** Rollen aus dem Cache oder aus der Datenbank. */
    private fun rolesOf(userId: UUID): Set<String> =
        cacheEntry(userId).roles

    private fun cacheEntry(userId: UUID): UserPermissionCache.Entry {
        permissionCache.get(userId)?.let { return it }

        val roles = userRoleRepository.findByIdUserId(userId).map { it.id.role.name }.toSet()
        val customPermissions = userPermissionRepository.findByIdUserId(userId).map { it.id.permission }.toSet()
        val entry = UserPermissionCache.Entry(
            roles = roles,
            customPermissions = customPermissions,
            effectivePermissions = customPermissions + RolePermissionMatrix.derivePermissions(roles)
        )
        permissionCache.put(userId, entry)
        return entry
    }

    private fun toProfileDto(user: UserEntity): UserProfileDto {
        val entry = cacheEntry(user.id)
        val permissions = entry.effectivePermissions +
            RolePermissionMatrix.derivePermissions(entry.roles, user.drinkRecorder)
        return UserProfileDto(
            id = user.id.toString(),
            keycloakSubject = user.keycloakSubject,
            displayName = user.displayName,
            email = user.email,
            disabled = user.disabled,
            drinkRecorder = user.drinkRecorder,
            boardRole = user.boardRole?.name,
            roles = entry.roles,
            permissions = permissions,
            createdAt = user.createdAt,
            updatedAt = user.updatedAt
        )
    }

    companion object {
        const val DEFAULT_PAGE_SIZE = 25
        const val MAX_PAGE_SIZE = 100
        val DEFAULT_SORT: Sort = Sort.by(Sort.Direction.ASC, "displayName")
    }
}
