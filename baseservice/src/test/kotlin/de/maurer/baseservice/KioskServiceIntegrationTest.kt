package de.maurer.baseservice

import de.maurer.baseservice.domain.KioskSettingsEntity
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.KioskPinNotConfiguredException
import de.maurer.baseservice.repository.AuditLogRepository
import de.maurer.baseservice.repository.KioskSettingsRepository
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.AuditService
import de.maurer.baseservice.service.KioskService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** Kiosk-PIN gegen die echten Migrationen (H2-Profil `test`). */
@SpringBootTest
@ActiveProfiles("test")
class KioskServiceIntegrationTest @Autowired constructor(
    private val kioskService: KioskService,
    private val kioskSettingsRepository: KioskSettingsRepository,
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

    @BeforeEach
    fun reset() {
        kioskSettingsRepository.deleteAll()
    }

    @Test
    fun `without a pin the status says so and unlocking is refused`() {
        assertFalse(kioskService.status(terminal).pinConfigured)
        assertThrows(KioskPinNotConfiguredException::class.java) { kioskService.unlock("1234", terminal) }
    }

    @Test
    fun `board sets a pin that is stored only as a hash and audited`() {
        val status = kioskService.setPin("482913", board)

        assertTrue(status.pinConfigured)
        assertEquals("Vorstand Kiosk", status.pinUpdatedByName)
        val stored = kioskSettingsRepository.findById(KioskSettingsEntity.DEFAULT_ID).orElseThrow()
        assertNotNull(stored.pinHash)
        assertFalse(stored.pinHash!!.contains("482913"))
        assertTrue(stored.pinHash!!.startsWith("$2"))
        assertTrue(
            auditLogRepository.findAll().any {
                it.action == AuditService.ACTION_KIOSK_PIN_CHANGED && it.targetEntity == AuditService.TARGET_KIOSK
            }
        )
        // Das Terminal sieht nur, dass eine PIN gesetzt ist, nicht wer sie gesetzt hat.
        val terminalView = kioskService.status(terminal)
        assertTrue(terminalView.pinConfigured)
        assertNull(terminalView.pinUpdatedByName)
    }

    @Test
    fun `only board and admin may set the pin`() {
        val ex = assertThrows(AccessDeniedException::class.java) { kioskService.setPin("1234", terminal) }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        assertThrows(AccessDeniedException::class.java) { kioskService.setPin("1234", member) }
    }

    @Test
    fun `plain members cannot use kiosk endpoints`() {
        kioskService.setPin("1234", board)
        assertThrows(AccessDeniedException::class.java) { kioskService.status(member) }
        assertThrows(AccessDeniedException::class.java) { kioskService.unlock("1234", member) }
    }

    @Test
    fun `pin must be four to eight digits`() {
        for (invalid in listOf("123", "123456789", "12a4", "", "12 34")) {
            val ex = assertThrows(InvalidRequestException::class.java) { kioskService.setPin(invalid, board) }
            assertEquals(ErrorCode.KIOSK_PIN_INVALID_FORMAT, ex.errorCode)
        }
        assertTrue(kioskService.setPin(" 12345678 ", board).pinConfigured)
    }

    @Test
    fun `correct pin unlocks and wrong pin counts down`() {
        kioskService.setPin("2468", board)

        val wrong = kioskService.unlock("1111", terminal)
        assertFalse(wrong.unlocked)
        assertEquals(KioskService.MAX_FAILED_ATTEMPTS - 1, wrong.remainingAttempts)

        val right = kioskService.unlock("2468", terminal)
        assertTrue(right.unlocked)
        assertEquals(0, kioskSettingsRepository.findById(KioskSettingsEntity.DEFAULT_ID).orElseThrow().failedAttempts)
    }

    @Test
    fun `too many wrong pins lock the check even for the correct pin`() {
        kioskService.setPin("2468", board)

        repeat(KioskService.MAX_FAILED_ATTEMPTS - 1) { kioskService.unlock("0000", terminal) }
        val locked = kioskService.unlock("0000", terminal)
        assertFalse(locked.unlocked)
        assertEquals(0, locked.remainingAttempts)
        assertNotNull(locked.lockedUntil)
        val minutes = Duration.between(Instant.now(), locked.lockedUntil).toSeconds()
        assertTrue(minutes in 50..60)

        val stillLocked = kioskService.unlock("2468", terminal)
        assertFalse(stillLocked.unlocked)
        assertTrue(auditLogRepository.findAll().any { it.action == AuditService.ACTION_KIOSK_PIN_LOCKED })
    }

    @Test
    fun `each further lockout lasts longer and a new pin clears the lock`() {
        kioskService.setPin("2468", board)
        repeat(KioskService.MAX_FAILED_ATTEMPTS) { kioskService.unlock("0000", terminal) }
        expireLock()

        repeat(KioskService.MAX_FAILED_ATTEMPTS - 1) { kioskService.unlock("0000", terminal) }
        val second = kioskService.unlock("0000", terminal)
        val seconds = Duration.between(Instant.now(), second.lockedUntil).toSeconds()
        assertTrue(seconds in 290..300)

        kioskService.setPin("97531", board)
        assertTrue(kioskService.unlock("97531", terminal).unlocked)
    }

    @Test
    fun `board can unlock a kiosk device as well`() {
        kioskService.setPin("2468", board)
        assertTrue(kioskService.unlock("2468", board).unlocked)
    }

    private fun expireLock() {
        val settings = kioskSettingsRepository.findById(KioskSettingsEntity.DEFAULT_ID).orElseThrow()
        settings.lockedUntil = Instant.now().minusSeconds(1)
        kioskSettingsRepository.save(settings)
    }
}
