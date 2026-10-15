package de.maurer.baseservice

import de.maurer.baseservice.domain.KioskSessionEntity
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.AuditLogRepository
import de.maurer.baseservice.repository.KioskSessionRepository
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.AuditService
import de.maurer.baseservice.service.KioskService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** Kiosk-Sitzungen gegen die echten Migrationen (H2-Profil `test`). */
@SpringBootTest
@ActiveProfiles("test")
class KioskServiceIntegrationTest @Autowired constructor(
    private val kioskService: KioskService,
    private val kioskSessionRepository: KioskSessionRepository,
    private val auditLogRepository: AuditLogRepository
) {

    private val board = UserPrincipal(
        subject = "kc-board-${UUID.randomUUID()}",
        displayName = "Vorstand Kiosk",
        roles = setOf(UserRole.BOARD, UserRole.MEMBER)
    )
    private val terminal = UserPrincipal(
        subject = "kc-terminal-${UUID.randomUUID()}",
        displayName = "Theke",
        roles = setOf(RolePermissionMatrix.ROLE_TABLET_RECORDER)
    )
    private val member = UserPrincipal(
        subject = "kc-member-${UUID.randomUUID()}",
        roles = setOf(UserRole.MEMBER)
    )

    private fun start(pin: String = "2468", label: String? = "Theke links") =
        UUID.fromString(kioskService.start(pin, label, terminal).id)

    @Test
    fun `the device sets its own pin which is stored only as a hash`() {
        val dto = kioskService.start("482913", "  Theke links  ", terminal)

        assertTrue(dto.active)
        assertEquals("Theke links", dto.label)
        assertEquals("Theke", dto.startedByName)
        val stored = kioskSessionRepository.findById(UUID.fromString(dto.id)).orElseThrow()
        assertFalse(stored.pinHash.contains("482913"))
        assertTrue(stored.pinHash.startsWith("$2"))
        assertTrue(
            auditLogRepository.findAll().any {
                it.action == AuditService.ACTION_KIOSK_STARTED && it.targetId == dto.id
            }
        )
    }

    @Test
    fun `without a label the session is named after the account`() {
        assertEquals("Theke", kioskService.start("1234", "  ", terminal).label)
    }

    @Test
    fun `pin must be four to eight digits`() {
        for (invalid in listOf("123", "123456789", "12a4", "", "12 34")) {
            val ex = assertThrows(InvalidRequestException::class.java) { kioskService.start(invalid, null, terminal) }
            assertEquals(ErrorCode.KIOSK_PIN_INVALID_FORMAT, ex.errorCode)
        }
        assertTrue(kioskService.start(" 12345678 ", null, terminal).active)
    }

    @Test
    fun `plain members cannot use kiosk endpoints`() {
        val id = start()
        assertThrows(AccessDeniedException::class.java) { kioskService.start("1234", null, member) }
        assertThrows(AccessDeniedException::class.java) { kioskService.state(id, member) }
        assertThrows(AccessDeniedException::class.java) { kioskService.unlock(id, "2468", member) }
    }

    @Test
    fun `correct pin ends the session and wrong pin counts down`() {
        val id = start()

        val wrong = kioskService.unlock(id, "1111", terminal)
        assertFalse(wrong.unlocked)
        assertEquals(KioskService.MAX_FAILED_ATTEMPTS - 1, wrong.remainingAttempts)
        assertTrue(kioskService.state(id, terminal).active)

        assertTrue(kioskService.unlock(id, "2468", terminal).unlocked)
        val state = kioskService.state(id, terminal)
        assertFalse(state.active)
        assertEquals(KioskSessionEntity.END_REASON_PIN, state.endReason)
    }

    @Test
    fun `each device has its own pin`() {
        val first = start("1111")
        val second = start("2222")
        assertFalse(kioskService.unlock(first, "2222", terminal).unlocked)
        assertTrue(kioskService.unlock(second, "2222", terminal).unlocked)
        assertTrue(kioskService.state(first, terminal).active)
    }

    @Test
    fun `too many wrong pins lock the check and each lock lasts longer`() {
        val id = start()

        repeat(KioskService.MAX_FAILED_ATTEMPTS - 1) { kioskService.unlock(id, "0000", terminal) }
        val locked = kioskService.unlock(id, "0000", terminal)
        assertFalse(locked.unlocked)
        assertNotNull(locked.lockedUntil)
        assertTrue(Duration.between(Instant.now(), locked.lockedUntil).toSeconds() in 50..60)
        assertFalse(kioskService.unlock(id, "2468", terminal).unlocked)
        assertTrue(auditLogRepository.findAll().any { it.action == AuditService.ACTION_KIOSK_PIN_LOCKED })

        expireLock(id)
        repeat(KioskService.MAX_FAILED_ATTEMPTS - 1) { kioskService.unlock(id, "0000", terminal) }
        val second = kioskService.unlock(id, "0000", terminal)
        assertTrue(Duration.between(Instant.now(), second.lockedUntil).toSeconds() in 290..300)
    }

    @Test
    fun `board sees running devices and can end one remotely without the pin`() {
        val id = start()
        repeat(KioskService.MAX_FAILED_ATTEMPTS) { kioskService.unlock(id, "0000", terminal) }

        assertTrue(kioskService.listActive(board).any { it.id == id.toString() && it.label == "Theke links" })

        val ended = kioskService.endRemotely(id, board)
        assertFalse(ended.active)
        assertEquals(KioskSessionEntity.END_REASON_REMOTE, ended.endReason)
        assertFalse(kioskService.listActive(board).any { it.id == id.toString() })
        assertTrue(auditLogRepository.findAll().any { it.action == AuditService.ACTION_KIOSK_ENDED_REMOTELY })

        // Das Gerät sieht das Ende und darf den Modus verlassen.
        assertFalse(kioskService.state(id, terminal).active)
        assertTrue(kioskService.unlock(id, "9999", terminal).unlocked)
    }

    @Test
    fun `only board and admin may list or end sessions remotely`() {
        val id = start()
        assertThrows(AccessDeniedException::class.java) { kioskService.listActive(terminal) }
        assertThrows(AccessDeniedException::class.java) { kioskService.endRemotely(id, terminal) }
        assertTrue(kioskService.state(id, terminal).active)
    }

    @Test
    fun `unknown sessions are not found`() {
        assertThrows(ResourceNotFoundException::class.java) { kioskService.state(UUID.randomUUID(), terminal) }
    }

    private fun expireLock(id: UUID) {
        val session = kioskSessionRepository.findById(id).orElseThrow()
        session.lockedUntil = Instant.now().minusSeconds(1)
        kioskSessionRepository.save(session)
    }
}
