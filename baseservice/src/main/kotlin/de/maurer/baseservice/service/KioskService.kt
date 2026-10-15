package de.maurer.baseservice.service

import de.maurer.baseservice.domain.KioskSettingsEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.KioskStatusDto
import de.maurer.baseservice.dto.KioskUnlockResultDto
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.KioskPinNotConfiguredException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.repository.KioskSettingsRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import org.slf4j.LoggerFactory
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Duration
import java.time.Instant

/**
 * Kiosk-Modus des Thekenterminals.
 *
 * - Die PIN setzen oder ändern dürfen nur Vorstand und Administration. Sie gilt
 *   für alle Terminals und liegt nur als BCrypt-Hash in `kiosk_settings`.
 * - Prüfen dürfen das Terminal (`purchase.tablet`) sowie Vorstand und
 *   Administration. Nach [MAX_FAILED_ATTEMPTS] falschen Eingaben ist die Prüfung
 *   gesperrt, jede weitere Sperre dauert länger ([LOCKOUT_STEPS]). Eine richtige
 *   Eingabe oder eine neue PIN setzt Zähler und Sperre zurück.
 *
 * Falsche Eingaben werden als Ergebnis und nicht als Ausnahme gemeldet, damit
 * der erhöhte Fehlerzähler mit der Transaktion gespeichert wird.
 */
@Service
class KioskService(
    private val kioskSettingsRepository: KioskSettingsRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userService: UserService,
    private val auditService: AuditService,
    private val clock: Clock = Clock.systemUTC()
) {

    private val log = LoggerFactory.getLogger(KioskService::class.java)
    private val encoder = BCryptPasswordEncoder()

    @Transactional(readOnly = true)
    fun status(principal: UserPrincipal): KioskStatusDto {
        val access = requireKioskAccess(principal)
        val settings = kioskSettingsRepository.findById(KioskSettingsEntity.DEFAULT_ID).orElse(null)
        return KioskStatusDto(
            pinConfigured = settings?.pinConfigured == true,
            pinUpdatedAt = settings?.pinUpdatedAt,
            pinUpdatedByName = if (access.manager) settings?.pinUpdatedBy?.displayName else null
        )
    }

    @Transactional
    fun setPin(rawPin: String?, principal: UserPrincipal): KioskStatusDto {
        val access = requireKioskAccess(principal)
        if (!access.manager) {
            throw AccessDeniedException(Msg("error.kiosk.manageDenied"), ErrorCode.ACCESS_DENIED)
        }
        val pin = rawPin?.trim().orEmpty()
        if (!PIN_PATTERN.matches(pin)) {
            throw InvalidRequestException(
                Msg("error.kiosk.pinFormat", MIN_PIN_LENGTH, MAX_PIN_LENGTH),
                ErrorCode.KIOSK_PIN_INVALID_FORMAT
            )
        }

        val now = Instant.now(clock)
        val settings = kioskSettingsRepository.findByIdForUpdate(KioskSettingsEntity.DEFAULT_ID)
            .orElseGet { KioskSettingsEntity() }
        val replaced = settings.pinConfigured
        settings.pinHash = encoder.encode(pin)
        settings.failedAttempts = 0
        settings.lockoutCount = 0
        settings.lockedUntil = null
        settings.pinUpdatedAt = now
        settings.pinUpdatedBy = access.user
        kioskSettingsRepository.save(settings)

        auditService.recordKioskAction(
            access.user,
            AuditService.ACTION_KIOSK_PIN_CHANGED,
            null
        )
        log.info("kiosk pin set by={} replaced={}", access.user.id, replaced)
        return KioskStatusDto(true, now, access.user.displayName)
    }

    @Transactional
    fun unlock(rawPin: String?, principal: UserPrincipal): KioskUnlockResultDto {
        val access = requireKioskAccess(principal)
        val settings = kioskSettingsRepository.findByIdForUpdate(KioskSettingsEntity.DEFAULT_ID).orElse(null)
        if (settings == null || !settings.pinConfigured) throw KioskPinNotConfiguredException()

        val now = Instant.now(clock)
        if (settings.isLocked(now)) {
            return KioskUnlockResultDto(unlocked = false, remainingAttempts = 0, lockedUntil = settings.lockedUntil)
        }

        val pin = rawPin?.trim().orEmpty()
        val matches = pin.length <= MAX_PIN_LENGTH && encoder.matches(pin, settings.pinHash)
        if (matches) {
            settings.failedAttempts = 0
            settings.lockoutCount = 0
            settings.lockedUntil = null
            kioskSettingsRepository.save(settings)
            log.info("kiosk unlocked by={}", access.user.id)
            return KioskUnlockResultDto(unlocked = true, remainingAttempts = null, lockedUntil = null)
        }

        settings.failedAttempts += 1
        if (settings.failedAttempts < MAX_FAILED_ATTEMPTS) {
            kioskSettingsRepository.save(settings)
            log.info("kiosk unlock failed by={} attempts={}", access.user.id, settings.failedAttempts)
            return KioskUnlockResultDto(
                unlocked = false,
                remainingAttempts = MAX_FAILED_ATTEMPTS - settings.failedAttempts,
                lockedUntil = null
            )
        }

        val step = LOCKOUT_STEPS[settings.lockoutCount.coerceAtMost(LOCKOUT_STEPS.size - 1)]
        settings.failedAttempts = 0
        settings.lockoutCount += 1
        settings.lockedUntil = now.plus(step)
        kioskSettingsRepository.save(settings)
        auditService.recordKioskAction(
            access.user,
            AuditService.ACTION_KIOSK_PIN_LOCKED,
            "durationMinutes=${step.toMinutes()}"
        )
        log.warn("kiosk pin locked by={} until={}", access.user.id, settings.lockedUntil)
        return KioskUnlockResultDto(unlocked = false, remainingAttempts = 0, lockedUntil = settings.lockedUntil)
    }

    private data class KioskAccess(val user: UserEntity, val manager: Boolean)

    /** Terminal (`purchase.tablet`), Vorstand oder Administration; sonst `403`. */
    private fun requireKioskAccess(principal: UserPrincipal): KioskAccess {
        val user = userService.getOrCreateUser(principal)
        val dbRoles = userRoleRepository.findByIdUserId(user.id).map { it.id.role.name }.toSet()
        val roles = principal.roles + dbRoles
        val manager = roles.any { it == UserRole.BOARD || it == UserRole.ADMIN }
        val drinkRecorder = principal.drinkRecorder || user.drinkRecorder
        val permissions = principal.permissions + RolePermissionMatrix.derivePermissions(roles, drinkRecorder)
        if (!manager && !permissions.contains(Permission.PURCHASE_TABLET)) {
            throw AccessDeniedException(Msg("error.kiosk.accessDenied"), ErrorCode.ACCESS_DENIED)
        }
        return KioskAccess(user, manager)
    }

    companion object {
        const val MIN_PIN_LENGTH = 4
        const val MAX_PIN_LENGTH = 8
        const val MAX_FAILED_ATTEMPTS = 5
        private val PIN_PATTERN = Regex("^[0-9]{$MIN_PIN_LENGTH,$MAX_PIN_LENGTH}$")

        /** Dauer der 1., 2., 3. und jeder weiteren Sperre. */
        val LOCKOUT_STEPS: List<Duration> = listOf(
            Duration.ofMinutes(1),
            Duration.ofMinutes(5),
            Duration.ofMinutes(15),
            Duration.ofMinutes(60)
        )
    }
}
