package de.maurer.baseservice.service

import de.maurer.baseservice.domain.StammtischMemberEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.domain.UserPermissionEntity
import de.maurer.baseservice.domain.UserPermissionId
import de.maurer.baseservice.domain.UserRoleEntity
import de.maurer.baseservice.domain.UserRoleId
import de.maurer.baseservice.domain.BoardRole as DomainBoardRole
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.*
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.UserPermissionRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.BoardRole
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.StammtischManagers
import de.maurer.baseservice.tenancy.StammtischMembers
import de.maurer.baseservice.tenancy.TenantContext
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

/**
 * Konten (global) und Mitglieder (je Stammtisch).
 *
 * Ein Konto gehört der Person und gilt in allen ihren Stammtischen. Rollen,
 * individuelle Berechtigungen, Vorstandsfunktion und der Status „aktiv“
 * gehören zur Mitgliedschaft und gelten nur im aktuellen Stammtisch.
 * Verwaltungsfunktionen sehen ausschließlich Mitglieder des eigenen
 * Stammtischs.
 */
@Service
@Transactional
class UserService(
    private val userRepository: UserRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userPermissionRepository: UserPermissionRepository,
    private val memberRepository: StammtischMemberRepository,
    private val userProvisioningService: UserProvisioningService,
    private val membershipService: MembershipService,
    private val access: StammtischAccess,
    private val members: StammtischMembers,
    private val managers: StammtischManagers,
    private val auditService: AuditService
) {

    /**
     * Liest oder legt das Konto zur Keycloak-Identität an.
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
     * `deny by default`: Fremde Profile sehen nur Personen mit
     * Mitgliederverwaltung, und nur von Mitgliedern des eigenen Stammtischs.
     */
    @Transactional(readOnly = true)
    fun getUserById(id: UUID, principal: UserPrincipal): UserProfileDto {
        val callerUser = getOrCreateUser(principal)
        if (callerUser.id == id) return toProfileDto(callerUser)

        if (!access.has(principal, callerUser, Permission.MEMBERS_MANAGE)) {
            throw AccessDeniedException(Msg("error.user.profileViewDenied"), ErrorCode.ACCESS_DENIED)
        }
        return toProfileDto(members.requireKnownUser(id))
    }

    /** Aktive Mitglieder des Stammtischs für Auswahllisten; für alle Mitglieder sichtbar. */
    @Transactional(readOnly = true)
    fun directory(principal: UserPrincipal): List<MemberDirectoryEntryDto> {
        getOrCreateUser(principal)
        val rolesByUser = rolesByUser()
        return memberRepository.findByActiveTrue()
            .filter { it.user?.disabled == false }
            .sortedBy { it.user!!.displayName.lowercase() }
            .map { member ->
                val user = member.user!!
                MemberDirectoryEntryDto(
                    id = user.id.toString(),
                    displayName = user.displayName,
                    boardRole = member.boardRole?.name,
                    roles = rolesByUser[user.id].orEmpty()
                )
            }
    }

    /**
     * Paginierte, gefilterte und sortierte Mitgliederliste des Stammtischs.
     * `disabled` meint hier: Mitgliedschaft beendet oder Konto gesperrt.
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
        if (!access.has(principal, callerUser, Permission.MEMBERS_READ)) {
            throw AccessDeniedException(
                Msg("error.user.listDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }

        if (role != null && !access.roleDefinitions().containsKey(role)) {
            throw InvalidRequestException(Msg("error.user.invalidRoleFilter", role), ErrorCode.INVALID_REQUEST)
        }

        val effectivePageable = normalizePageable(pageable)
        val page: Page<UserEntity> = userRepository.findAll(
            userSpecification(role, disabled, search),
            effectivePageable
        )

        val membersByUser = memberRepository.findAllBy().associateBy { it.user?.id }
        val content = page.content.map { user ->
            val member = membersByUser[user.id]
            val roles = rolesOf(user.id)
            UserSummaryDto(
                id = user.id.toString(),
                keycloakSubject = user.keycloakSubject,
                displayName = user.displayName,
                email = user.email,
                disabled = user.disabled || member?.active != true,
                drinkRecorder = roles.contains(RolePermissionMatrix.ROLE_TABLET_RECORDER),
                boardRole = member?.boardRole?.name,
                roles = roles,
                createdAt = member?.joinedAt ?: user.createdAt
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

    /**
     * Ändert eine Mitgliedschaft. Name und E-Mail gehören zum Konto, das in
     * mehreren Stammtischen gilt; sie ändert nur die Person selbst oder die
     * Plattform-Administration.
     */
    fun adminUpdateUser(id: UUID, request: AdminUpdateUserRequest, principal: UserPrincipal): UserProfileDto {
        val callerUser = getOrCreateUser(principal)
        requireMembersManage(principal, callerUser)

        val user = members.requireKnownUser(id)
        val member = memberRepository.findByUserId(user.id).orElseThrow {
            ResourceNotFoundException(Msg("error.user.notFound", id), ErrorCode.NOT_FOUND)
        }

        val touchesPrivileges = request.roles != null || request.permissions != null ||
            request.disabled != null || request.drinkRecorder != null
        if (touchesPrivileges) {
            requireNotSelf(callerUser, user)
        }

        val changesAccount = (request.displayName != null && request.displayName.trim() != user.displayName) ||
            (request.email != null && request.email.trim().ifBlank { null } != user.email)
        if (changesAccount) {
            if (!principal.platformAdmin) {
                throw AccessDeniedException(Msg("error.user.accountEditDenied"), ErrorCode.ACCESS_DENIED)
            }
            if (request.displayName != null) {
                val name = request.displayName.trim()
                if (name.isBlank()) {
                    throw InvalidRequestException(Msg("error.user.displayNameBlank"), ErrorCode.INVALID_REQUEST)
                }
                user.displayName = name
            }
            if (request.email != null) {
                user.email = request.email.trim().ifBlank { null }
            }
            userRepository.save(user)
        }

        var updated = changesAccount

        val wasDisabled = !member.active
        if (request.disabled != null && request.disabled != wasDisabled) {
            if (request.disabled) {
                managers.requireRemaining(leaving = setOf(user.id))
                membershipService.deactivate(user)
            } else {
                membershipService.addMember(user, emptySet())
            }
            updated = true
            auditService.recordUserChange(
                callerUser,
                AuditService.ACTION_STATUS_CHANGED,
                user.id,
                wasDisabled,
                request.disabled
            )
        }

        if (request.boardRole != null) {
            val boardRole = request.boardRole.trim()
            if (boardRole.isNotBlank() && !BoardRole.ALL.contains(boardRole)) {
                throw InvalidRequestException(Msg("error.user.invalidBoardRole", boardRole), ErrorCode.INVALID_REQUEST)
            }
            member.boardRole = DomainBoardRole.fromValue(boardRole)
            memberRepository.save(member)
            updated = true
        }

        if (updated) {
            auditService.recordUserChange(
                callerUser,
                AuditService.ACTION_PROFILE_ADMIN_UPDATED,
                user.id,
                null,
                "displayName=${user.displayName}; active=${member.active}; boardRole=${member.boardRole?.name}"
            )
        }

        if (request.roles != null || request.drinkRecorder != null) {
            requireRolesManage(principal, callerUser)
            var roles = request.roles ?: rolesOf(user.id)
            if (request.drinkRecorder != null) {
                roles = if (request.drinkRecorder) {
                    roles + RolePermissionMatrix.ROLE_TABLET_RECORDER
                } else {
                    roles - RolePermissionMatrix.ROLE_TABLET_RECORDER
                }
            }
            setRolesForUser(callerUser, user, roles)
        }

        if (request.permissions != null) {
            requireRolesManage(principal, callerUser)
            setPermissionsForUser(callerUser, user, request.permissions)
        }

        return toProfileDto(user)
    }

    fun assignRoles(id: UUID, roles: Set<String>, principal: UserPrincipal): UserProfileDto {
        val callerUser = getOrCreateUser(principal)
        requireRolesManage(principal, callerUser)

        val user = members.requireActiveUser(id)
        requireNotSelf(callerUser, user)

        setRolesForUser(callerUser, user, roles)
        return toProfileDto(user)
    }

    fun assignPermissions(id: UUID, permissions: Set<String>, principal: UserPrincipal): UserProfileDto {
        val callerUser = getOrCreateUser(principal)
        requireRolesManage(principal, callerUser)

        val user = members.requireActiveUser(id)
        requireNotSelf(callerUser, user)

        setPermissionsForUser(callerUser, user, permissions)
        return toProfileDto(user)
    }

    /** Beendet oder reaktiviert die Mitgliedschaft im aktuellen Stammtisch. */
    fun setUserStatus(id: UUID, disabled: Boolean, principal: UserPrincipal): UserProfileDto {
        val callerUser = getOrCreateUser(principal)
        requireMembersManage(principal, callerUser)

        val user = members.requireKnownUser(id)
        requireNotSelf(callerUser, user)

        val previous = !membershipService.isActiveMember(user)
        if (disabled) {
            managers.requireRemaining(leaving = setOf(user.id))
            membershipService.deactivate(user)
        } else if (previous) {
            membershipService.addMember(user, setOf(UserRole.MEMBER))
        }

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

            // Nur Personen mit einer Mitgliedschaft in diesem Stammtisch (aktiv oder beendet).
            val memberQuery = query!!.subquery(UUID::class.java)
            val memberRoot = memberQuery.from(StammtischMemberEntity::class.java)
            val memberUserId = memberRoot.get<UserEntity>("user").get<UUID>("id")
            val memberPredicates = mutableListOf<Predicate>(builder.equal(memberUserId, root.get<UUID>("id")))
            if (disabled == false) {
                memberPredicates.add(builder.isTrue(memberRoot.get("active")))
            }
            memberQuery.select(memberUserId).where(*memberPredicates.toTypedArray())
            predicates.add(builder.exists(memberQuery))

            if (disabled == false) {
                predicates.add(builder.isFalse(root.get("disabled")))
            } else if (disabled == true) {
                val activeQuery = query.subquery(UUID::class.java)
                val activeRoot = activeQuery.from(StammtischMemberEntity::class.java)
                val activeUserId = activeRoot.get<UserEntity>("user").get<UUID>("id")
                activeQuery.select(activeUserId).where(
                    builder.equal(activeUserId, root.get<UUID>("id")),
                    builder.isTrue(activeRoot.get("active"))
                )
                predicates.add(builder.or(builder.isTrue(root.get("disabled")), builder.not(builder.exists(activeQuery))))
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
                val subquery = query.subquery(UUID::class.java)
                val roleRoot = subquery.from(UserRoleEntity::class.java)
                subquery.select(roleRoot.get<UserRoleId>("id").get<UUID>("userId"))
                subquery.where(
                    builder.equal(roleRoot.get<UserRoleId>("id").get<String>("role"), role),
                    builder.equal(roleRoot.get<UserRoleId>("id").get<UUID>("userId"), root.get<UUID>("id"))
                )
                predicates.add(builder.exists(subquery))
            }

            builder.and(*predicates.toTypedArray())
        }

    private fun setRolesForUser(actor: UserEntity, user: UserEntity, roles: Set<String>) {
        val known = access.roleDefinitions().keys
        val invalidRoles = roles.filter { it !in known }
        if (invalidRoles.isNotEmpty()) {
            throw InvalidRequestException(Msg("error.user.invalidRoles", invalidRoles), ErrorCode.INVALID_REQUEST)
        }

        val previousRoles = rolesOf(user.id)
        managers.requireRemaining(assignments = mapOf(user.id to roles))

        userRoleRepository.deleteByIdUserId(user.id)
        userRoleRepository.flush()

        roles.forEach { role ->
            userRoleRepository.save(UserRoleEntity(UserRoleId(user.id, role), user))
        }
        userRoleRepository.flush()

        auditService.recordUserChange(
            actor,
            AuditService.ACTION_ROLES_CHANGED,
            user.id,
            previousRoles,
            roles
        )
    }

    private fun setPermissionsForUser(actor: UserEntity, user: UserEntity, permissions: Set<String>) {
        val effective = permissions.map { it.trim() }.filter { it.isNotBlank() }.toSet()
        val unknown = effective.filter { it !in RolePermissionMatrix.KNOWN_PERMISSIONS }
        if (unknown.isNotEmpty()) {
            throw InvalidRequestException(Msg("error.user.invalidPermissions", unknown), ErrorCode.INVALID_REQUEST)
        }
        val previousPermissions = userPermissionRepository.findByIdUserId(user.id).map { it.id.permission }.toSet()

        userPermissionRepository.deleteByIdUserId(user.id)
        userPermissionRepository.flush()

        effective.forEach { permission ->
            userPermissionRepository.save(UserPermissionEntity(UserPermissionId(user.id, permission), user))
        }
        userPermissionRepository.flush()

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

    private fun requireMembersManage(principal: UserPrincipal, callerUser: UserEntity) {
        if (!access.has(principal, callerUser, Permission.MEMBERS_MANAGE)) {
            throw AccessDeniedException(Msg("error.user.adminRequired"), ErrorCode.ACCESS_DENIED)
        }
    }

    private fun requireRolesManage(principal: UserPrincipal, callerUser: UserEntity) {
        if (!access.has(principal, callerUser, Permission.ROLES_MANAGE)) {
            throw AccessDeniedException(Msg("error.user.adminRequired"), ErrorCode.ACCESS_DENIED)
        }
    }

    /** Rollen im aktuellen Stammtisch; ohne Stammtisch keine. */
    private fun rolesOf(userId: UUID): Set<String> {
        if (TenantContext.stammtischId() == null) return emptySet()
        return userRoleRepository.findByIdUserId(userId).map { it.id.role }.toSet()
    }

    private fun rolesByUser(): Map<UUID, Set<String>> =
        userRoleRepository.findAll().groupBy({ it.id.userId }, { it.id.role }).mapValues { it.value.toSet() }

    private fun toProfileDto(user: UserEntity): UserProfileDto {
        val inStammtisch = TenantContext.stammtischId() != null
        val roles = rolesOf(user.id)
        val member = if (inStammtisch) memberRepository.findByUserId(user.id).orElse(null) else null
        val custom = if (inStammtisch) {
            userPermissionRepository.findByIdUserId(user.id).map { it.id.permission }.toSet()
        } else {
            emptySet()
        }
        return UserProfileDto(
            id = user.id.toString(),
            keycloakSubject = user.keycloakSubject,
            displayName = user.displayName,
            email = user.email,
            disabled = user.disabled || (inStammtisch && member?.active != true),
            drinkRecorder = roles.contains(RolePermissionMatrix.ROLE_TABLET_RECORDER),
            boardRole = member?.boardRole?.name,
            roles = roles,
            permissions = access.permissionsForRoles(roles) + custom,
            createdAt = user.createdAt,
            updatedAt = user.updatedAt,
            termsVersion = user.termsVersion,
            statisticsEnabled = user.statisticsEnabled
        )
    }

    companion object {
        const val DEFAULT_PAGE_SIZE = 25
        const val MAX_PAGE_SIZE = 100
        val DEFAULT_SORT: Sort = Sort.by(Sort.Direction.ASC, "displayName")
    }
}
