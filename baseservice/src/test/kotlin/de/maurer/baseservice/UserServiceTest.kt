package de.maurer.baseservice

import de.maurer.baseservice.domain.StammtischMemberEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.domain.UserPermissionEntity
import de.maurer.baseservice.domain.UserPermissionId
import de.maurer.baseservice.domain.UserRoleEntity
import de.maurer.baseservice.domain.UserRoleId
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.*
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.UserPermissionRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.*
import de.maurer.baseservice.service.AuditService
import de.maurer.baseservice.service.MembershipService
import de.maurer.baseservice.service.UserProvisioningService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.support.StammtischTestSupport
import de.maurer.baseservice.tenancy.StammtischManagers
import de.maurer.baseservice.tenancy.StammtischMembers
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

    @Mock
    private lateinit var memberRepository: StammtischMemberRepository

    @Mock
    private lateinit var membershipService: MembershipService

    @Mock
    private lateinit var members: StammtischMembers

    @Mock
    private lateinit var managers: StammtischManagers

    private lateinit var userService: UserService

    // Primärschlüssel sind seit der Umstellung auf den nativen uuid-Typ echte UUIDs.
    private val adminId: UUID = UUID.randomUUID()
    private val targetId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        userService = UserService(
            userRepository,
            userRoleRepository,
            userPermissionRepository,
            memberRepository,
            userProvisioningService,
            membershipService,
            StammtischTestSupport.access(userRoleRepository, userPermissionRepository),
            members,
            managers,
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
    fun `getOrCreateUser auto-provisions a non-existing account`() {
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
    fun `getProfile returns roles and permissions of the current Stammtisch`() {
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
            listOf(UserRoleEntity(UserRoleId(memberOneId, UserRole.MEMBER), user))
        )
        `when`(userPermissionRepository.findByIdUserId(memberOneId)).thenReturn(
            listOf(UserPermissionEntity(UserPermissionId(memberOneId, "custom.special"), user))
        )

        `when`(memberRepository.findByUserId(memberOneId))
            .thenReturn(Optional.of(StammtischMemberEntity(user = user)))

        val profile = userService.getProfile(principal)

        assertEquals(memberOneId.toString(), profile.id)
        assertFalse(profile.disabled)
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

}
