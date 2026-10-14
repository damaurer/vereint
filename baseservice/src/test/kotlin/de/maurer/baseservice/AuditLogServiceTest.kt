package de.maurer.baseservice

import de.maurer.baseservice.domain.AuditLogEntity
import de.maurer.baseservice.domain.BoardRole as DomainBoardRole
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.NotificationEntity
import de.maurer.baseservice.repository.AuditLogRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.NotificationRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.AuditLogService
import de.maurer.baseservice.service.AuditService
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
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.domain.Specification
import java.time.Instant
import java.util.UUID

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuditLogServiceTest {

    @Mock
    private lateinit var auditLogRepository: AuditLogRepository

    @Mock
    private lateinit var userService: UserService

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userRepository: UserRepository

    @Mock
    private lateinit var ledgerEntryRepository: LedgerEntryRepository

    @Mock
    private lateinit var notificationRepository: NotificationRepository

    private lateinit var service: AuditLogService

    private val callerId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        service = AuditLogService(
            auditLogRepository, userService, userRoleRepository,
            userRepository, ledgerEntryRepository, notificationRepository
        )
    }

    @Suppress("UNCHECKED_CAST")
    private fun anySpecification(): Specification<AuditLogEntity> =
        (any(Specification::class.java) as Specification<AuditLogEntity>?) ?: Specification { _, _, _ -> null }

    private fun anyPageable(): Pageable = any(Pageable::class.java) ?: Pageable.unpaged()

    private fun caller(boardRole: DomainBoardRole? = null) =
        UserEntity(id = callerId, keycloakSubject = "sub-caller", displayName = "Caller", boardRole = boardRole)

    private fun principal(vararg roles: String) =
        UserPrincipal(subject = "sub-caller", roles = roles.toSet())

    private fun stubEmptyPage() {
        `when`(auditLogRepository.findAll(anySpecification(), anyPageable())).thenAnswer { invocation ->
            PageImpl(emptyList<AuditLogEntity>(), invocation.arguments[1] as Pageable, 0)
        }
    }

    @Test
    fun `admin can read every audit target`() {
        `when`(userService.getOrCreateUser(principal(UserRole.ADMIN))).thenReturn(caller())
        val entry = AuditLogEntity(
            id = UUID.randomUUID(),
            actor = caller(),
            action = AuditService.ACTION_ROLES_CHANGED,
            targetEntity = AuditService.TARGET_USER,
            targetId = UUID.randomUUID().toString(),
            details = "old=-; new=admin",
            createdAt = Instant.now()
        )
        `when`(auditLogRepository.findAll(anySpecification(), anyPageable())).thenAnswer { invocation ->
            PageImpl(listOf(entry), invocation.arguments[1] as Pageable, 1)
        }

        val page = service.listAuditLogs(
            targetEntity = AuditService.TARGET_USER,
            action = null,
            actorId = null,
            targetId = null,
            pageable = Pageable.unpaged(),
            principal = principal(UserRole.ADMIN)
        )

        assertEquals(1, page.content.size)
        assertEquals(AuditService.TARGET_USER, page.content[0].targetEntity)
        assertEquals(callerId.toString(), page.content[0].actorId)
        assertEquals("Caller", page.content[0].actorDisplayName)
    }

    @Test
    fun `treasurer sees ledger audits but is denied user and notification`() {
        `when`(userService.getOrCreateUser(principal(UserRole.BOARD)))
            .thenReturn(caller(DomainBoardRole.treasurer))
        stubEmptyPage()

        // erlaubt: Ledger
        service.listAuditLogs(AuditService.TARGET_LEDGER, null, null, null, Pageable.unpaged(), principal(UserRole.BOARD))

        val deniedUser = assertThrows(AccessDeniedException::class.java) {
            service.listAuditLogs(AuditService.TARGET_USER, null, null, null, Pageable.unpaged(), principal(UserRole.BOARD))
        }
        assertEquals(ErrorCode.ACCESS_DENIED, deniedUser.errorCode)

        val deniedNotification = assertThrows(AccessDeniedException::class.java) {
            service.listAuditLogs(AuditService.TARGET_NOTIFICATION, null, null, null, Pageable.unpaged(), principal(UserRole.BOARD))
        }
        assertEquals(ErrorCode.ACCESS_DENIED, deniedNotification.errorCode)
    }

    @Test
    fun `secretary sees notification audits but is denied ledger`() {
        `when`(userService.getOrCreateUser(principal(UserRole.BOARD)))
            .thenReturn(caller(DomainBoardRole.secretary))
        stubEmptyPage()

        service.listAuditLogs(AuditService.TARGET_NOTIFICATION, null, null, null, Pageable.unpaged(), principal(UserRole.BOARD))

        val denied = assertThrows(AccessDeniedException::class.java) {
            service.listAuditLogs(AuditService.TARGET_LEDGER, null, null, null, Pageable.unpaged(), principal(UserRole.BOARD))
        }
        assertEquals(ErrorCode.ACCESS_DENIED, denied.errorCode)
    }

    @Test
    fun `general board without sub-role sees ledger and notification but not user`() {
        `when`(userService.getOrCreateUser(principal(UserRole.BOARD))).thenReturn(caller(null))
        stubEmptyPage()

        service.listAuditLogs(AuditService.TARGET_LEDGER, null, null, null, Pageable.unpaged(), principal(UserRole.BOARD))
        service.listAuditLogs(AuditService.TARGET_NOTIFICATION, null, null, null, Pageable.unpaged(), principal(UserRole.BOARD))

        val denied = assertThrows(AccessDeniedException::class.java) {
            service.listAuditLogs(AuditService.TARGET_USER, null, null, null, Pageable.unpaged(), principal(UserRole.BOARD))
        }
        assertEquals(ErrorCode.ACCESS_DENIED, denied.errorCode)
    }

    @Test
    fun `assessor without a privileged area is denied entirely`() {
        `when`(userService.getOrCreateUser(principal(UserRole.BOARD)))
            .thenReturn(caller(DomainBoardRole.assessor))

        val denied = assertThrows(AccessDeniedException::class.java) {
            service.listAuditLogs(null, null, null, null, Pageable.unpaged(), principal(UserRole.BOARD))
        }
        assertEquals(ErrorCode.ACCESS_DENIED, denied.errorCode)
        verify(auditLogRepository, never()).findAll(anySpecification(), anyPageable())
    }

    @Test
    fun `member without board or admin role is denied by default`() {
        `when`(userService.getOrCreateUser(principal(UserRole.MEMBER))).thenReturn(caller())

        val denied = assertThrows(AccessDeniedException::class.java) {
            service.listAuditLogs(null, null, null, null, Pageable.unpaged(), principal(UserRole.MEMBER))
        }
        assertEquals(ErrorCode.ACCESS_DENIED, denied.errorCode)
        verify(auditLogRepository, never()).findAll(anySpecification(), anyPageable())
    }

    @Test
    fun `unknown target entity is rejected as an invalid request`() {
        `when`(userService.getOrCreateUser(principal(UserRole.ADMIN))).thenReturn(caller())

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.listAuditLogs("Nonsense", null, null, null, Pageable.unpaged(), principal(UserRole.ADMIN))
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `invalid actor id is rejected as an invalid request`() {
        `when`(userService.getOrCreateUser(principal(UserRole.ADMIN))).thenReturn(caller())

        val ex = assertThrows(InvalidRequestException::class.java) {
            service.listAuditLogs(null, null, "not-a-uuid", null, Pageable.unpaged(), principal(UserRole.ADMIN))
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `page size is capped at the configured maximum`() {
        `when`(userService.getOrCreateUser(principal(UserRole.ADMIN))).thenReturn(caller())
        `when`(auditLogRepository.findAll(anySpecification(), anyPageable())).thenAnswer { invocation ->
            val requested = invocation.arguments[1] as Pageable
            assertEquals(AuditLogService.MAX_PAGE_SIZE, requested.pageSize)
            PageImpl(emptyList<AuditLogEntity>(), requested, 0)
        }

        val page = service.listAuditLogs(
            targetEntity = null,
            action = null,
            actorId = null,
            targetId = null,
            pageable = PageRequest.of(0, 5000),
            principal = principal(UserRole.ADMIN)
        )

        assertEquals(AuditLogService.MAX_PAGE_SIZE, page.size)
    }

    @Test
    fun `audit entries name the affected member and notification subject instead of ids`() {
        `when`(userService.getOrCreateUser(principal(UserRole.ADMIN))).thenReturn(caller())
        val member = UserEntity(id = UUID.randomUUID(), keycloakSubject = "sub-m", displayName = "Erika Muster")
        val notification = NotificationEntity(user = member, title = "Sommerfest", body = "Kommt alle", type = "general")
        val ledgerEntry = LedgerEntryEntity(member = member)
        fun entry(target: String, targetId: UUID) = AuditLogEntity(
            id = UUID.randomUUID(), actor = caller(), action = "X", targetEntity = target,
            targetId = targetId.toString(), details = null, createdAt = Instant.now()
        )
        val entries = listOf(
            entry(AuditService.TARGET_USER, member.id),
            entry(AuditService.TARGET_LEDGER, ledgerEntry.id),
            entry(AuditService.TARGET_NOTIFICATION, notification.id)
        )
        `when`(auditLogRepository.findAll(anySpecification(), anyPageable())).thenAnswer { invocation ->
            PageImpl(entries, invocation.arguments[1] as Pageable, 3)
        }
        `when`(userRepository.findAllById(setOf(member.id))).thenReturn(listOf(member))
        `when`(ledgerEntryRepository.findByIdIn(setOf(ledgerEntry.id))).thenReturn(listOf(ledgerEntry))
        `when`(notificationRepository.findAllById(setOf(notification.id))).thenReturn(listOf(notification))

        val content = service.listAuditLogs(null, null, null, null, Pageable.unpaged(), principal(UserRole.ADMIN)).content

        assertEquals(listOf("Erika Muster", "Erika Muster", "Erika Muster"), content.map { it.targetName })
        assertEquals("Sommerfest", content[2].targetTitle)
    }
}
