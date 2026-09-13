package de.maurer.baseservice

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
import de.maurer.baseservice.security.*
import de.maurer.baseservice.service.AuditService
import de.maurer.baseservice.service.UserPermissionCache
import de.maurer.baseservice.service.UserProvisioningService
import de.maurer.baseservice.service.UserService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.ArgumentMatchers.any
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.junit.jupiter.MockitoSettings
import org.mockito.quality.Strictness
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.domain.Specification
import java.time.Instant
import java.util.*

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserServiceTest {

    @Mock
    private lateinit var userRepository: UserRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userPermissionRepository: UserPermissionRepository

    @Mock
    private lateinit var userProvisioningService: UserProvisioningService

    @Mock
    private lateinit var auditService: AuditService

    private lateinit var permissionCache: UserPermissionCache

    private lateinit var userService: UserService

    // Primärschlüssel sind seit der Umstellung auf den nativen uuid-Typ echte UUIDs.
    private val adminId: UUID = UUID.randomUUID()
    private val targetId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        permissionCache = UserPermissionCache()
        userService = UserService(
            userRepository,
            userRoleRepository,
            userPermissionRepository,
            userProvisioningService,
            permissionCache,
            auditService
        )
    }

    private fun anyUserEntity(): UserEntity = any(UserEntity::class.java) ?: UserEntity()

    @Suppress("UNCHECKED_CAST")
    private fun anySpecification(): Specification<UserEntity> =
        (any(Specification::class.java) as Specification<UserEntity>?) ?: Specification { _, _, _ -> null }

    private fun anyPageable(): Pageable = any(Pageable::class.java) ?: Pageable.unpaged()

    private fun eqValue(value: String): String = eq(value) ?: value

    private fun eqUuid(value: UUID): UUID = eq(value) ?: value

    private fun anyUuid(): UUID = any(UUID::class.java) ?: UUID.randomUUID()

    private fun anyNullableUser(): UserEntity? = any()

    private fun anyNullableValue(): Any? = any()

    @Test
    fun `getOrCreateUser auto-provisions non-existing user with default member role`() {
        val principal = UserPrincipal(
            subject = "sub-alice",
            displayName = "Alice Wonderland",
            email = "alice@example.com",
            roles = setOf("member")
        )
        val aliceId = UUID.randomUUID()
        val provisioned = UserEntity(
            id = aliceId,
            keycloakSubject = "sub-alice",
            displayName = "Alice Wonderland",
            email = "alice@example.com"
        )

        `when`(userRepository.findByKeycloakSubject("sub-alice")).thenReturn(Optional.empty())
        `when`(userProvisioningService.createUser(principal)).thenReturn(provisioned)

        val user = userService.getOrCreateUser(principal)

        assertEquals(aliceId, user.id)
        assertEquals("sub-alice", user.keycloakSubject)
        assertFalse(user.disabled)
        verify(userProvisioningService).createUser(principal)
    }

    @Test
    fun `getOrCreateUser re-reads profile when concurrent request already created it`() {
        val principal = UserPrincipal(subject = "sub-race", displayName = "Racer", roles = setOf("member"))
        val raceId = UUID.randomUUID()
        val winner = UserEntity(id = raceId, keycloakSubject = "sub-race", displayName = "Racer")

        // Erstes Lesen: nicht vorhanden -> Anlegen scheitert am Unique-Constraint
        // Zweites Lesen: der nebenläufige Request hat das Profil bereits angelegt
        `when`(userRepository.findByKeycloakSubject("sub-race"))
            .thenReturn(Optional.empty())
            .thenReturn(Optional.of(winner))
        `when`(userProvisioningService.createUser(principal))
            .thenThrow(DataIntegrityViolationException("uk_users_keycloak_subject"))

        val user = userService.getOrCreateUser(principal)

        assertEquals(raceId, user.id)
        verify(userRepository, times(2)).findByKeycloakSubject("sub-race")
    }

    @Test
    fun `getOrCreateUser fails with profile error when re-read stays empty`() {
        val principal = UserPrincipal(subject = "sub-broken", roles = setOf("member"))

        `when`(userRepository.findByKeycloakSubject("sub-broken")).thenReturn(Optional.empty())
        `when`(userProvisioningService.createUser(principal))
            .thenThrow(DataIntegrityViolationException("constraint"))

        val ex = assertThrows(ProfileNotFoundException::class.java) {
            userService.getOrCreateUser(principal)
        }
        assertEquals(ErrorCode.PROFILE_NOT_FOUND, ex.errorCode)
    }

    @Test
    fun `getOrCreateUser throws AccountDisabledException when user is disabled`() {
        val existingUser = UserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = "sub-disabled",
            displayName = "Disabled User",
            disabled = true
        )
        val principal = UserPrincipal(subject = "sub-disabled", roles = setOf("member"))

        `when`(userRepository.findByKeycloakSubject("sub-disabled")).thenReturn(Optional.of(existingUser))

        val ex = assertThrows(AccountDisabledException::class.java) {
            userService.getOrCreateUser(principal)
        }
        assertEquals(ErrorCode.ACCOUNT_DISABLED, ex.errorCode)
    }

    @Test
    fun `getProfile returns resolved profile with roles and permissions from the matrix`() {
        val memberOneId = UUID.randomUUID()
        val user = UserEntity(
            id = memberOneId,
            keycloakSubject = "sub-member-1",
            displayName = "Member One",
            email = "member@example.com",
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )
        val principal = UserPrincipal(subject = "sub-member-1", roles = setOf("member"))

        `when`(userRepository.findByKeycloakSubject("sub-member-1")).thenReturn(Optional.of(user))
        `when`(userRoleRepository.findByIdUserId(memberOneId)).thenReturn(
            listOf(UserRoleEntity(UserRoleId(memberOneId, AssignedRole.member), user))
        )
        `when`(userPermissionRepository.findByIdUserId(memberOneId)).thenReturn(
            listOf(UserPermissionEntity(UserPermissionId(memberOneId, "custom.special"), user))
        )

        val profile = userService.getProfile(principal)

        assertEquals(memberOneId.toString(), profile.id)
        assertTrue(profile.roles.contains(UserRole.MEMBER))
        assertTrue(profile.permissions.contains("custom.special"))
        assertTrue(profile.permissions.contains(Permission.PROFILE_READ_SELF))
        assertTrue(profile.permissions.contains(Permission.PURCHASE_SELF))
        assertEquals(
            RolePermissionMatrix.permissionsForRole(UserRole.MEMBER) + "custom.special",
            profile.permissions
        )
    }

    @Test
    fun `permission derivation is cached per user and invalidated on role change`() {
        val adminUser = UserEntity(id = adminId, keycloakSubject = "sub-admin")
        val targetUser = UserEntity(id = targetId, keycloakSubject = "sub-target")
        val adminPrincipal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))

        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(adminUser))
        `when`(userRepository.findById(targetId)).thenReturn(Optional.of(targetUser))
        `when`(userRepository.save(anyUserEntity())).thenAnswer { it.arguments[0] }
        `when`(userRepository.countActiveUsersWithRole(AssignedRole.admin)).thenReturn(3L)
        `when`(userRoleRepository.findByIdUserId(targetId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(targetId)).thenReturn(emptyList())

        userService.getUserById(targetId, adminPrincipal)
        userService.getUserById(targetId, adminPrincipal)

        // Zweiter Aufruf wird aus dem Cache bedient
        verify(userRoleRepository, times(1)).findByIdUserId(targetId)

        userService.assignRoles(targetId, setOf(UserRole.BOARD), adminPrincipal)
        userService.getUserById(targetId, adminPrincipal)

        // Nach der Rollenänderung wird neu gelesen
        verify(userRoleRepository, atLeast(2)).findByIdUserId(targetId)
    }

    @Test
    fun `updateProfile updates displayName and email`() {
        val userId = UUID.randomUUID()
        val user = UserEntity(id = userId, keycloakSubject = "sub-1", displayName = "Old Name", email = "old@example.com")
        val principal = UserPrincipal(subject = "sub-1", roles = setOf("member"))

        `when`(userRepository.findByKeycloakSubject("sub-1")).thenReturn(Optional.of(user))
        `when`(userRepository.save(anyUserEntity())).thenAnswer { it.arguments[0] }
        `when`(userRoleRepository.findByIdUserId(userId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(userId)).thenReturn(emptyList())

        val updated = userService.updateProfile(
            principal,
            UpdateProfileRequest(displayName = "New Name", email = "new@example.com")
        )

        assertEquals("New Name", updated.displayName)
        assertEquals("new@example.com", updated.email)
        verify(userRepository).save(user)
    }

    @Test
    fun `updateProfile throws InvalidRequestException on blank displayName`() {
        val user = UserEntity(id = UUID.randomUUID(), keycloakSubject = "sub-1", displayName = "Old Name")
        val principal = UserPrincipal(subject = "sub-1", roles = setOf("member"))

        `when`(userRepository.findByKeycloakSubject("sub-1")).thenReturn(Optional.of(user))

        val ex = assertThrows(InvalidRequestException::class.java) {
            userService.updateProfile(principal, UpdateProfileRequest(displayName = "   "))
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `listUsers returns a paginated result for admins`() {
        val adminUser = UserEntity(id = adminId, keycloakSubject = "sub-admin")
        val targetUser = UserEntity(
            id = targetId,
            keycloakSubject = "sub-target",
            displayName = "Target",
            email = "target@test.com"
        )
        val adminPrincipal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))
        val pageable = PageRequest.of(0, 10)

        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(adminUser))
        `when`(userRepository.findAll(anySpecification(), anyPageable()))
            .thenReturn(PageImpl(listOf(targetUser), PageRequest.of(0, 10), 1))
        `when`(userRoleRepository.findByIdUserId(targetId)).thenReturn(
            listOf(UserRoleEntity(UserRoleId(targetId, AssignedRole.member), targetUser))
        )
        `when`(userPermissionRepository.findByIdUserId(targetId)).thenReturn(emptyList())

        val page = userService.listUsers(
            role = null,
            disabled = null,
            search = "target",
            pageable = pageable,
            principal = adminPrincipal
        )

        assertEquals(1, page.content.size)
        assertEquals(targetId.toString(), page.content[0].id)
        assertEquals(0, page.page)
        assertEquals(1L, page.totalElements)
    }

    @Test
    fun `listUsers caps the page size at the configured maximum`() {
        val adminUser = UserEntity(id = adminId, keycloakSubject = "sub-admin")
        val adminPrincipal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))

        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(adminUser))
        `when`(userRepository.findAll(anySpecification(), anyPageable())).thenAnswer { invocation ->
            val requested = invocation.arguments[1] as Pageable
            assertEquals(UserService.MAX_PAGE_SIZE, requested.pageSize)
            PageImpl(emptyList<UserEntity>(), requested, 0)
        }

        val page = userService.listUsers(
            role = null,
            disabled = null,
            search = null,
            pageable = PageRequest.of(0, 5000),
            principal = adminPrincipal
        )

        assertEquals(UserService.MAX_PAGE_SIZE, page.size)
    }

    @Test
    fun `listUsers denies access for regular member`() {
        val memberId = UUID.randomUUID()
        val memberUser = UserEntity(id = memberId, keycloakSubject = "sub-member")
        val memberPrincipal = UserPrincipal(subject = "sub-member", roles = setOf(UserRole.MEMBER))

        `when`(userRepository.findByKeycloakSubject("sub-member")).thenReturn(Optional.of(memberUser))
        `when`(userRoleRepository.findByIdUserId(memberId)).thenReturn(
            listOf(UserRoleEntity(UserRoleId(memberId, AssignedRole.member), memberUser))
        )

        val ex = assertThrows(AccessDeniedException::class.java) {
            userService.listUsers(null, null, null, Pageable.unpaged(), memberPrincipal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `getUserById allows self and admin but rejects other users`() {
        val callerId = UUID.randomUUID()
        val targetUser = UserEntity(id = targetId, keycloakSubject = "sub-target", displayName = "Target")
        val callerUser = UserEntity(id = callerId, keycloakSubject = "sub-caller")
        val callerPrincipal = UserPrincipal(subject = "sub-caller", roles = setOf(UserRole.MEMBER))

        `when`(userRepository.findById(targetId)).thenReturn(Optional.of(targetUser))
        `when`(userRepository.findByKeycloakSubject("sub-caller")).thenReturn(Optional.of(callerUser))
        `when`(userRoleRepository.findByIdUserId(callerId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(callerId)).thenReturn(emptyList())

        assertThrows(AccessDeniedException::class.java) {
            userService.getUserById(targetId, callerPrincipal)
        }

        val adminPrincipal = UserPrincipal(subject = "sub-caller", roles = setOf(UserRole.ADMIN))
        `when`(userRoleRepository.findByIdUserId(targetId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(targetId)).thenReturn(emptyList())

        val profile = userService.getUserById(targetId, adminPrincipal)
        assertEquals(targetId.toString(), profile.id)
    }

    @Test
    fun `getUserById denies non-admin access to a disabled account`() {
        val boardId = UUID.randomUUID()
        val targetUser = UserEntity(
            id = targetId,
            keycloakSubject = "sub-target",
            displayName = "Target",
            disabled = true
        )
        val boardUser = UserEntity(id = boardId, keycloakSubject = "sub-board")
        val boardPrincipal = UserPrincipal(subject = "sub-board", roles = setOf(UserRole.BOARD))

        `when`(userRepository.findById(targetId)).thenReturn(Optional.of(targetUser))
        `when`(userRepository.findByKeycloakSubject("sub-board")).thenReturn(Optional.of(boardUser))
        `when`(userRoleRepository.findByIdUserId(boardId)).thenReturn(
            listOf(UserRoleEntity(UserRoleId(boardId, AssignedRole.board), boardUser))
        )
        `when`(userPermissionRepository.findByIdUserId(boardId)).thenReturn(emptyList())

        val ex = assertThrows(AccessDeniedException::class.java) {
            userService.getUserById(targetId, boardPrincipal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `adminUpdateUser modifies roles, permissions, boardRole, and disabled flag`() {
        val adminUser = UserEntity(id = adminId, keycloakSubject = "sub-admin")
        val targetUser = UserEntity(id = targetId, keycloakSubject = "sub-target", displayName = "Target")
        val adminPrincipal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))

        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(adminUser))
        `when`(userRepository.findById(targetId)).thenReturn(Optional.of(targetUser))
        `when`(userRepository.save(anyUserEntity())).thenAnswer { it.arguments[0] }
        `when`(userRoleRepository.findByIdUserId(targetId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(targetId)).thenReturn(emptyList())

        userService.adminUpdateUser(
            id = targetId,
            request = AdminUpdateUserRequest(
                displayName = "Updated Admin Target",
                boardRole = BoardRole.TREASURER,
                disabled = true,
                drinkRecorder = true,
                roles = setOf(UserRole.BOARD),
                permissions = setOf(Permission.LEDGER_READ)
            ),
            principal = adminPrincipal
        )

        assertEquals("Updated Admin Target", targetUser.displayName)
        assertEquals(DomainBoardRole.treasurer, targetUser.boardRole)
        assertTrue(targetUser.disabled)
        assertTrue(targetUser.drinkRecorder)

        verify(userRoleRepository).deleteByIdUserId(targetId)
        verify(userPermissionRepository).deleteByIdUserId(targetId)
        verify(auditService).recordUserChange(
            anyNullableUser(),
            eqValue(AuditService.ACTION_ROLES_CHANGED),
            eqUuid(targetId),
            anyNullableValue(),
            anyNullableValue()
        )
    }

    @Test
    fun `assignRoles validates and sets roles`() {
        val adminUser = UserEntity(id = adminId, keycloakSubject = "sub-admin")
        val targetUser = UserEntity(id = targetId, keycloakSubject = "sub-target")
        val adminPrincipal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))

        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(adminUser))
        `when`(userRepository.findById(targetId)).thenReturn(Optional.of(targetUser))
        `when`(userRepository.save(anyUserEntity())).thenAnswer { it.arguments[0] }
        `when`(userRoleRepository.findByIdUserId(targetId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(targetId)).thenReturn(emptyList())

        userService.assignRoles(targetId, setOf(UserRole.BOARD, UserRole.MEMBER), adminPrincipal)

        verify(userRoleRepository).deleteByIdUserId(targetId)
        verify(userRoleRepository, times(2)).save(any(UserRoleEntity::class.java) ?: UserRoleEntity())
    }

    @Test
    fun `assignRoles rejects invalid role`() {
        val adminUser = UserEntity(id = adminId, keycloakSubject = "sub-admin")
        val targetUser = UserEntity(id = targetId, keycloakSubject = "sub-target")
        val adminPrincipal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))

        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(adminUser))
        `when`(userRepository.findById(targetId)).thenReturn(Optional.of(targetUser))

        val ex = assertThrows(InvalidRequestException::class.java) {
            userService.assignRoles(targetId, setOf("super_mega_admin"), adminPrincipal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `assignRoles rejects self assignment of admin role`() {
        val adminUser = UserEntity(id = adminId, keycloakSubject = "sub-admin")
        val adminPrincipal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))

        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(adminUser))
        `when`(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser))

        val ex = assertThrows(SelfPrivilegeChangeDeniedException::class.java) {
            userService.assignRoles(adminId, setOf(UserRole.ADMIN), adminPrincipal)
        }
        assertEquals(ErrorCode.SELF_PRIVILEGE_CHANGE_DENIED, ex.errorCode)
        verify(userRoleRepository, never()).deleteByIdUserId(anyUuid())
    }

    @Test
    fun `assignPermissions rejects self assignment`() {
        val adminUser = UserEntity(id = adminId, keycloakSubject = "sub-admin")
        val adminPrincipal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))

        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(adminUser))
        `when`(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser))

        assertThrows(SelfPrivilegeChangeDeniedException::class.java) {
            userService.assignPermissions(adminId, setOf(Permission.LEDGER_CORRECT), adminPrincipal)
        }
    }

    @Test
    fun `setUserStatus rejects self deactivation`() {
        val adminUser = UserEntity(id = adminId, keycloakSubject = "sub-admin")
        val adminPrincipal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))

        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(adminUser))
        `when`(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser))

        val ex = assertThrows(SelfPrivilegeChangeDeniedException::class.java) {
            userService.setUserStatus(adminId, true, adminPrincipal)
        }
        assertEquals(ErrorCode.SELF_PRIVILEGE_CHANGE_DENIED, ex.errorCode)
    }

    @Test
    fun `setUserStatus keeps at least one active admin account`() {
        val lastAdminId = UUID.randomUUID()
        val adminUser = UserEntity(id = adminId, keycloakSubject = "sub-admin")
        val lastAdmin = UserEntity(id = lastAdminId, keycloakSubject = "sub-last-admin")
        val adminPrincipal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))

        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(adminUser))
        `when`(userRepository.findById(lastAdminId)).thenReturn(Optional.of(lastAdmin))
        `when`(userRoleRepository.findByIdUserId(lastAdminId)).thenReturn(
            listOf(UserRoleEntity(UserRoleId(lastAdminId, AssignedRole.admin), lastAdmin))
        )
        `when`(userPermissionRepository.findByIdUserId(lastAdminId)).thenReturn(emptyList())
        `when`(userRepository.countActiveUsersWithRole(AssignedRole.admin)).thenReturn(1L)

        val ex = assertThrows(LastAdminProtectedException::class.java) {
            userService.setUserStatus(lastAdminId, true, adminPrincipal)
        }
        assertEquals(ErrorCode.LAST_ADMIN_PROTECTED, ex.errorCode)
        assertFalse(lastAdmin.disabled)
    }

    @Test
    fun `setUserStatus sets disabled flag and writes an audit entry`() {
        val adminUser = UserEntity(id = adminId, keycloakSubject = "sub-admin")
        val targetUser = UserEntity(id = targetId, keycloakSubject = "sub-target", disabled = false)
        val adminPrincipal = UserPrincipal(subject = "sub-admin", roles = setOf(UserRole.ADMIN))

        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(adminUser))
        `when`(userRepository.findById(targetId)).thenReturn(Optional.of(targetUser))
        `when`(userRepository.save(anyUserEntity())).thenAnswer { it.arguments[0] }
        `when`(userRoleRepository.findByIdUserId(targetId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(targetId)).thenReturn(emptyList())

        userService.setUserStatus(targetId, true, adminPrincipal)

        assertTrue(targetUser.disabled)
        verify(userRepository).save(targetUser)
        verify(auditService).recordUserChange(
            anyNullableUser(),
            eqValue(AuditService.ACTION_STATUS_CHANGED),
            eqUuid(targetId),
            anyNullableValue(),
            anyNullableValue()
        )
    }
}
