package de.maurer.baseservice

import de.maurer.baseservice.domain.AssignedRole
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventGuestEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.GuestStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.domain.UserPermissionEntity
import de.maurer.baseservice.domain.UserPermissionId
import de.maurer.baseservice.domain.UserRoleEntity
import de.maurer.baseservice.domain.UserRoleId
import de.maurer.baseservice.domain.BoardRole as DomainBoardRole
import de.maurer.baseservice.dto.AccessCheckRequest
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.repository.*
import de.maurer.baseservice.security.AppContext
import de.maurer.baseservice.security.BoardRole
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.AccessResolverService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.*
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.*

class AccessResolverServiceTest {

    private lateinit var userRepository: UserRepository
    private lateinit var userRoleRepository: UserRoleRepository
    private lateinit var userPermissionRepository: UserPermissionRepository
    private lateinit var eventRepository: EventRepository
    private lateinit var eventParticipantRepository: EventParticipantRepository
    private lateinit var eventGuestRepository: EventGuestRepository

    private lateinit var service: AccessResolverService

    @BeforeEach
    fun setUp() {
        userRepository = mock(UserRepository::class.java)
        userRoleRepository = mock(UserRoleRepository::class.java)
        userPermissionRepository = mock(UserPermissionRepository::class.java)
        eventRepository = mock(EventRepository::class.java)
        eventParticipantRepository = mock(EventParticipantRepository::class.java)
        eventGuestRepository = mock(EventGuestRepository::class.java)

        service = AccessResolverService(
            userRepository,
            userRoleRepository,
            userPermissionRepository,
            eventRepository,
            eventParticipantRepository,
            eventGuestRepository
        )
    }

    private fun sha256(value: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    @Test
    fun `resolveUserAccess denies access by default when principal has no roles and no db entry`() {
        val principal = UserPrincipal(subject = "user-no-role")
        `when`(userRepository.findByKeycloakSubject("user-no-role")).thenReturn(Optional.empty())

        val decision = service.resolveUserAccess(principal)

        assertEquals("user-no-role", decision.subject)
        assertTrue(decision.roles.isEmpty())
        assertTrue(decision.permissions.isEmpty())
        assertTrue(decision.allowedAppContexts.isEmpty())
    }

    @Test
    fun `resolveUserAccess denies access by default for disabled database user`() {
        val principal = UserPrincipal(subject = "sub-disabled", roles = setOf("admin"))
        val dbUser = UserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = "sub-disabled",
            displayName = "Disabled User",
            disabled = true
        )
        `when`(userRepository.findByKeycloakSubject("sub-disabled")).thenReturn(Optional.of(dbUser))

        val decision = service.resolveUserAccess(principal)

        assertTrue(decision.disabled)
        assertTrue(decision.roles.isEmpty())
        assertTrue(decision.permissions.isEmpty())
        assertTrue(decision.allowedAppContexts.isEmpty())
    }

    @Test
    fun `resolveUserAccess resolves member roles and permissions correctly`() {
        val principal = UserPrincipal(
            subject = "sub-member",
            email = "member@vereint.local",
            displayName = "Max Member",
            roles = setOf("member")
        )
        val memberId = UUID.randomUUID()
        val dbUser = UserEntity(
            id = memberId,
            keycloakSubject = "sub-member",
            displayName = "Max Member",
            email = "member@vereint.local",
            disabled = false
        )
        `when`(userRepository.findByKeycloakSubject("sub-member")).thenReturn(Optional.of(dbUser))
        `when`(userRoleRepository.findByIdUserId(memberId)).thenReturn(
            listOf(UserRoleEntity(id = UserRoleId(memberId, AssignedRole.member), user = dbUser))
        )
        `when`(userPermissionRepository.findByIdUserId(memberId)).thenReturn(emptyList())
        `when`(eventRepository.findByOwnerId(memberId)).thenReturn(emptyList())
        `when`(eventParticipantRepository.findByUserId(memberId)).thenReturn(emptyList())

        val decision = service.resolveUserAccess(principal)

        assertFalse(decision.disabled)
        assertTrue(decision.roles.contains(UserRole.MEMBER))
        assertTrue(decision.allowedAppContexts.contains(AppContext.MEMBER_PWA))
        assertFalse(decision.allowedAppContexts.contains(AppContext.ADMIN))
        assertFalse(decision.allowedAppContexts.contains(AppContext.BOARD_GENERAL))
        assertTrue(decision.permissions.contains(Permission.PROFILE_READ_SELF))
        assertTrue(decision.permissions.contains(Permission.BALANCE_READ_SELF))
        assertTrue(decision.permissions.contains(Permission.PURCHASE_SELF))
        assertFalse(decision.permissions.contains(Permission.CATALOG_APPROVE))
    }

    @Test
    fun `resolveUserAccess resolves board treasury roles correctly`() {
        val principal = UserPrincipal(
            subject = "sub-treasurer",
            roles = setOf("board"),
            boardRole = BoardRole.TREASURER
        )
        val treasurerId = UUID.randomUUID()
        val dbUser = UserEntity(
            id = treasurerId,
            keycloakSubject = "sub-treasurer",
            displayName = "Treasurer User",
            boardRole = DomainBoardRole.treasurer,
            disabled = false
        )
        `when`(userRepository.findByKeycloakSubject("sub-treasurer")).thenReturn(Optional.of(dbUser))
        `when`(userRoleRepository.findByIdUserId(treasurerId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(treasurerId)).thenReturn(emptyList())
        `when`(eventRepository.findByOwnerId(treasurerId)).thenReturn(emptyList())
        `when`(eventParticipantRepository.findByUserId(treasurerId)).thenReturn(emptyList())

        val decision = service.resolveUserAccess(principal)

        assertTrue(decision.roles.contains(UserRole.BOARD))
        assertEquals(BoardRole.TREASURER, decision.boardRole)
        assertTrue(decision.allowedAppContexts.contains(AppContext.MEMBER_PWA))
        assertTrue(decision.allowedAppContexts.contains(AppContext.BOARD_GENERAL))
        assertTrue(decision.allowedAppContexts.contains(AppContext.BOARD_TREASURY))
        assertFalse(decision.allowedAppContexts.contains(AppContext.ADMIN))
        assertTrue(decision.permissions.contains(Permission.LEDGER_READ))
        assertTrue(decision.permissions.contains(Permission.LEDGER_CORRECT))
        assertTrue(decision.permissions.contains(Permission.CATALOG_APPROVE))
    }

    @Test
    fun `resolveUserAccess resolves admin with all contexts and permissions`() {
        val principal = UserPrincipal(
            subject = "sub-admin",
            roles = setOf("admin")
        )
        val adminId = UUID.randomUUID()
        val dbUser = UserEntity(
            id = adminId,
            keycloakSubject = "sub-admin",
            displayName = "Admin User",
            disabled = false
        )
        `when`(userRepository.findByKeycloakSubject("sub-admin")).thenReturn(Optional.of(dbUser))
        `when`(userRoleRepository.findByIdUserId(adminId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(adminId)).thenReturn(emptyList())
        `when`(eventRepository.findByOwnerId(adminId)).thenReturn(emptyList())
        `when`(eventParticipantRepository.findByUserId(adminId)).thenReturn(emptyList())

        val decision = service.resolveUserAccess(principal)

        assertTrue(decision.roles.contains(UserRole.ADMIN))
        assertTrue(decision.allowedAppContexts.contains(AppContext.ADMIN))
        assertTrue(decision.allowedAppContexts.contains(AppContext.TABLET_RECORDER))
        assertTrue(decision.allowedAppContexts.contains(AppContext.BOARD_GENERAL))
        assertTrue(decision.allowedAppContexts.contains(AppContext.BOARD_TREASURY))
        assertTrue(decision.allowedAppContexts.contains(AppContext.BOARD_COMMUNICATIONS))
        assertTrue(decision.allowedAppContexts.contains(AppContext.MEMBER_PWA))
        assertTrue(decision.permissions.contains(Permission.PURCHASE_TABLET))
        assertTrue(decision.permissions.contains(Permission.EVENT_MANAGE))
    }

    @Test
    fun `resolveUserAccess resolves tabletRecorder context`() {
        val principal = UserPrincipal(
            subject = "sub-tablet",
            roles = setOf("tabletRecorder"),
            drinkRecorder = true
        )
        val tabletId = UUID.randomUUID()
        val dbUser = UserEntity(
            id = tabletId,
            keycloakSubject = "sub-tablet",
            displayName = "Tablet User",
            drinkRecorder = true,
            disabled = false
        )
        `when`(userRepository.findByKeycloakSubject("sub-tablet")).thenReturn(Optional.of(dbUser))
        `when`(userRoleRepository.findByIdUserId(tabletId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(tabletId)).thenReturn(emptyList())
        `when`(eventRepository.findByOwnerId(tabletId)).thenReturn(emptyList())
        `when`(eventParticipantRepository.findByUserId(tabletId)).thenReturn(emptyList())

        val decision = service.resolveUserAccess(principal)

        assertTrue(decision.drinkRecorder)
        assertTrue(decision.allowedAppContexts.contains(AppContext.TABLET_RECORDER))
        assertTrue(decision.permissions.contains(Permission.PURCHASE_TABLET))
        assertFalse(decision.allowedAppContexts.contains(AppContext.ADMIN))
    }

    @Test
    fun `checkAccess validates event ownership correctly`() {
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf("member"))
        val ownerId = UUID.randomUUID()
        val eventId = UUID.randomUUID()
        val foreignEventId = UUID.randomUUID()
        val dbUser = UserEntity(id = ownerId, keycloakSubject = "sub-owner", disabled = false)
        val event = EventEntity(id = eventId, title = "Sommerfest", owner = dbUser)

        `when`(userRepository.findByKeycloakSubject("sub-owner")).thenReturn(Optional.of(dbUser))
        `when`(userRoleRepository.findByIdUserId(ownerId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(ownerId)).thenReturn(emptyList())
        `when`(eventRepository.findByOwnerId(ownerId)).thenReturn(listOf(event))
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventParticipantRepository.findByUserId(ownerId)).thenReturn(emptyList())

        val ownerCheck = service.checkAccess(
            AccessCheckRequest(appContext = AppContext.EVENT_OWNER, eventId = eventId.toString()),
            principal
        )
        assertTrue(ownerCheck.allowed)

        val otherEventCheck = service.checkAccess(
            AccessCheckRequest(appContext = AppContext.EVENT_OWNER, eventId = foreignEventId.toString()),
            principal
        )
        assertFalse(otherEventCheck.allowed)
        assertEquals(ErrorCode.ACCESS_DENIED, otherEventCheck.errorCode)
    }

    @Test
    fun `checkAccess rejects a syntactically invalid event id with an invalid request error`() {
        val principal = UserPrincipal(subject = "sub-bad-id", roles = setOf("member"))
        val userId = UUID.randomUUID()
        val dbUser = UserEntity(id = userId, keycloakSubject = "sub-bad-id", disabled = false)

        `when`(userRepository.findByKeycloakSubject("sub-bad-id")).thenReturn(Optional.of(dbUser))
        `when`(userRoleRepository.findByIdUserId(userId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(userId)).thenReturn(emptyList())
        `when`(eventRepository.findByOwnerId(userId)).thenReturn(emptyList())
        `when`(eventParticipantRepository.findByUserId(userId)).thenReturn(emptyList())

        val exception = assertThrows(InvalidRequestException::class.java) {
            service.checkAccess(
                AccessCheckRequest(appContext = AppContext.EVENT, eventId = "not-a-uuid"),
                principal
            )
        }

        assertEquals(ErrorCode.INVALID_REQUEST, exception.errorCode)
    }

    @Test
    fun `validateGuestAccess rejects a syntactically invalid event id with an invalid request error`() {
        val exception = assertThrows(InvalidRequestException::class.java) {
            service.validateGuestAccess("evt-wrong", "some-guest-token")
        }

        assertEquals(ErrorCode.INVALID_REQUEST, exception.errorCode)
    }

    @Test
    fun `validateGuestAccess validates guest tokens properly`() {
        val eventId = UUID.randomUUID()
        val event = EventEntity(id = eventId, title = "Gartenparty", status = EventStatus.active)
        val token = "super-secret-guest-token-12345"
        val tokenHash = sha256(token)

        val guest = EventGuestEntity(
            id = UUID.randomUUID(),
            event = event,
            guestTokenHash = tokenHash,
            displayName = "Gast Max",
            status = GuestStatus.active,
            expiresAt = Instant.now().plus(2, ChronoUnit.HOURS)
        )

        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventGuestRepository.findByGuestTokenHash(tokenHash)).thenReturn(Optional.of(guest))

        val validCheck = service.validateGuestAccess(eventId.toString(), token)
        assertTrue(validCheck.allowed)
        assertEquals(AppContext.EVENT_GUEST, validCheck.appContext)

        // Expired guest
        guest.expiresAt = Instant.now().minus(1, ChronoUnit.HOURS)
        val expiredCheck = service.validateGuestAccess(eventId.toString(), token)
        assertFalse(expiredCheck.allowed)
        assertEquals(ErrorCode.INVITATION_EXPIRED, expiredCheck.errorCode)

        // Revoked guest
        guest.expiresAt = Instant.now().plus(2, ChronoUnit.HOURS)
        guest.status = GuestStatus.revoked
        val revokedCheck = service.validateGuestAccess(eventId.toString(), token)
        assertFalse(revokedCheck.allowed)
        assertEquals(ErrorCode.INVITATION_REVOKED, revokedCheck.errorCode)

        // Wrong event
        val wrongEventCheck = service.validateGuestAccess(UUID.randomUUID().toString(), token)
        assertFalse(wrongEventCheck.allowed)
    }

    @Test
    fun `resolveUserAccess reports owned events separately from participations`() {
        val principal = UserPrincipal(subject = "sub-mixed", roles = setOf("member"))
        val mixedId = UUID.randomUUID()
        val ownedEventId = UUID.randomUUID()
        val joinedEventId = UUID.randomUUID()
        val dbUser = UserEntity(id = mixedId, keycloakSubject = "sub-mixed", disabled = false)
        val ownedEvent = EventEntity(id = ownedEventId, title = "Eigenes Event", owner = dbUser)
        val joinedEvent = EventEntity(id = joinedEventId, title = "Fremdes Event")

        `when`(userRepository.findByKeycloakSubject("sub-mixed")).thenReturn(Optional.of(dbUser))
        `when`(userRoleRepository.findByIdUserId(mixedId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(mixedId)).thenReturn(emptyList())
        `when`(eventRepository.findByOwnerId(mixedId)).thenReturn(listOf(ownedEvent))
        `when`(eventParticipantRepository.findByUserId(mixedId)).thenReturn(
            listOf(EventParticipantEntity(event = joinedEvent, user = dbUser))
        )

        val decision = service.resolveUserAccess(principal)

        assertEquals(setOf(ownedEventId.toString()), decision.ownedEvents)
        assertTrue(decision.eventScopes.containsAll(setOf(ownedEventId.toString(), joinedEventId.toString())))
    }

    @Test
    fun `resolveUserAccess grants eventOwner context only for real ownership`() {
        val principal = UserPrincipal(subject = "sub-participant", roles = setOf("member"))
        val participantUserId = UUID.randomUUID()
        val dbUser = UserEntity(id = participantUserId, keycloakSubject = "sub-participant", disabled = false)
        val joinedEvent = EventEntity(id = UUID.randomUUID(), title = "Fremdes Event")

        `when`(userRepository.findByKeycloakSubject("sub-participant")).thenReturn(Optional.of(dbUser))
        `when`(userRoleRepository.findByIdUserId(participantUserId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(participantUserId)).thenReturn(emptyList())
        `when`(eventRepository.findByOwnerId(participantUserId)).thenReturn(emptyList())
        `when`(eventParticipantRepository.findByUserId(participantUserId)).thenReturn(
            listOf(EventParticipantEntity(event = joinedEvent, user = dbUser))
        )

        val decision = service.resolveUserAccess(principal)

        assertTrue(decision.ownedEvents.isEmpty())
        assertTrue(decision.allowedAppContexts.contains(AppContext.EVENT))
        assertFalse(decision.allowedAppContexts.contains(AppContext.EVENT_OWNER))
    }

    @Test
    fun `checkAccess denies unknown app context by default`() {
        val principal = UserPrincipal(subject = "sub-admin-unknown", roles = setOf("admin"))
        val unknownAdminId = UUID.randomUUID()
        val dbUser = UserEntity(id = unknownAdminId, keycloakSubject = "sub-admin-unknown", disabled = false)

        `when`(userRepository.findByKeycloakSubject("sub-admin-unknown")).thenReturn(Optional.of(dbUser))
        `when`(userRoleRepository.findByIdUserId(unknownAdminId)).thenReturn(emptyList())
        `when`(userPermissionRepository.findByIdUserId(unknownAdminId)).thenReturn(emptyList())
        `when`(eventRepository.findByOwnerId(unknownAdminId)).thenReturn(emptyList())
        `when`(eventParticipantRepository.findByUserId(unknownAdminId)).thenReturn(emptyList())

        val response = service.checkAccess(AccessCheckRequest(appContext = "superAdminConsole"), principal)

        assertFalse(response.allowed)
        assertEquals(ErrorCode.ACCESS_DENIED, response.errorCode)
        assertEquals("superAdminConsole", response.appContext)
    }

    @Test
    fun `checkAccess denies every context for a disabled user`() {
        val principal = UserPrincipal(subject = "sub-blocked", roles = setOf("admin"))
        val dbUser = UserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = "sub-blocked",
            displayName = "Blocked User",
            disabled = true
        )
        `when`(userRepository.findByKeycloakSubject("sub-blocked")).thenReturn(Optional.of(dbUser))

        val response = service.checkAccess(AccessCheckRequest(appContext = AppContext.MEMBER_PWA), principal)

        assertFalse(response.allowed)
        assertEquals(ErrorCode.ACCOUNT_DISABLED, response.errorCode)
    }

    @Test
    fun `checkAccess requires authentication for protected contexts`() {
        val response = service.checkAccess(AccessCheckRequest(appContext = AppContext.ADMIN), null)

        assertFalse(response.allowed)
        assertEquals(ErrorCode.ACCESS_DENIED, response.errorCode)
    }

    @Test
    fun `validateGuestAccess denies expired status, unknown token and missing input`() {
        val eventId = UUID.randomUUID()
        val event = EventEntity(id = eventId, title = "Negativfälle", status = EventStatus.active)
        val token = "guest-token-negative-cases"
        val tokenHash = sha256(token)
        val guest = EventGuestEntity(
            id = UUID.randomUUID(),
            event = event,
            guestTokenHash = tokenHash,
            displayName = "Gast Negativ",
            status = GuestStatus.expired,
            expiresAt = Instant.now().plus(2, ChronoUnit.HOURS)
        )

        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(event))
        `when`(eventGuestRepository.findByGuestTokenHash(tokenHash)).thenReturn(Optional.of(guest))
        `when`(eventGuestRepository.findByGuestTokenHash(sha256("unknown-token"))).thenReturn(Optional.empty())

        val expiredStatus = service.validateGuestAccess(eventId.toString(), token)
        assertFalse(expiredStatus.allowed)
        assertEquals(ErrorCode.INVITATION_EXPIRED, expiredStatus.errorCode)

        guest.status = GuestStatus.pending
        val pendingStatus = service.validateGuestAccess(eventId.toString(), token)
        assertFalse(pendingStatus.allowed)
        assertEquals(ErrorCode.ACCESS_DENIED, pendingStatus.errorCode)

        val unknownToken = service.validateGuestAccess(eventId.toString(), "unknown-token")
        assertFalse(unknownToken.allowed)
        assertEquals(ErrorCode.ACCESS_DENIED, unknownToken.errorCode)

        val missingToken = service.validateGuestAccess(eventId.toString(), null)
        assertFalse(missingToken.allowed)
        assertEquals(ErrorCode.ACCESS_DENIED, missingToken.errorCode)
    }

    @Test
    fun `validateGuestAccess denies cancelled and archived events`() {
        val cancelledId = UUID.randomUUID()
        val cancelled = EventEntity(id = cancelledId, title = "Abgesagt", status = EventStatus.cancelled)
        `when`(eventRepository.findById(cancelledId)).thenReturn(Optional.of(cancelled))

        val response = service.validateGuestAccess(cancelledId.toString(), "irrelevant-token")

        assertFalse(response.allowed)
        assertEquals(ErrorCode.EVENT_NOT_ACTIVE, response.errorCode)
    }

    @Test
    fun `describeRolePermissionMatrix exposes the versioned single source`() {
        val matrix = service.describeRolePermissionMatrix()

        assertEquals(RolePermissionMatrix.VERSION, matrix.version)
        assertEquals(RolePermissionMatrix.MATRIX, matrix.roles)
        assertTrue(matrix.assignableRoles.contains(UserRole.ADMIN))
        assertTrue(matrix.knownPermissions.contains(Permission.LEDGER_READ))
        assertTrue(matrix.appContexts.contains(AppContext.EVENT_OWNER))
    }
}
