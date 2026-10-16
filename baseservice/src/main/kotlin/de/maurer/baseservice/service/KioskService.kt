package de.maurer.baseservice.service

import de.maurer.baseservice.billing.PlanLimits
import de.maurer.baseservice.domain.KioskSessionEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.KioskSessionDto
import de.maurer.baseservice.dto.KioskUnlockResultDto
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.KioskSessionRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import org.slf4j.LoggerFactory
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Kiosk-Modus des Thekenterminals.
 *
 * - Das Gerät startet eine Sitzung und vergibt dabei seine eigene PIN
 *   (4 bis 8 Ziffern); gespeichert wird nur ihr BCrypt-Hash. Starten dürfen das
 *   Terminal (`purchase.tablet`) sowie Vorstand und Administration.
 * - Am Gerät endet die Sitzung nur mit der richtigen PIN. Nach
 *   [MAX_FAILED_ATTEMPTS] falschen Eingaben ist die Prüfung gesperrt, jede
 *   weitere Sperre dauert länger ([LOCKOUT_STEPS]).
 * - Vorstand und Administration sehen die laufenden Sitzungen und können jede
 *   jederzeit ohne PIN beenden; das Gerät erkennt das über [state].
 *
 * Falsche Eingaben werden als Ergebnis und nicht als Ausnahme gemeldet, damit
 * der erhöhte Fehlerzähler mit der Transaktion gespeichert wird.
 */
@Service
class KioskService(
    private val kioskSessionRepository: KioskSessionRepository,
    private val access: StammtischAccess,
    private val userService: UserService,
    private val auditService: AuditService,
    private val planLimits: PlanLimits,
    private val clock: Clock = Clock.systemUTC()
) {

    private val log = LoggerFactory.getLogger(KioskService::class.java)
    private val encoder = BCryptPasswordEncoder()

    @Transactional
    fun start(rawPin: String?, rawLabel: String?, principal: UserPrincipal): KioskSessionDto {
        val access = requireKioskAccess(principal)
        val pin = rawPin?.trim().orEmpty()
        if (!PIN_PATTERN.matches(pin)) {
            throw InvalidRequestException(
                Msg("error.kiosk.pinFormat", MIN_PIN_LENGTH, MAX_PIN_LENGTH),
                ErrorCode.KIOSK_PIN_INVALID_FORMAT
            )
        }
        // Mehrere Thekenterminals gleichzeitig nur im Tarif Premium (Code verein).
        planLimits.requireKioskSlot()
        val label = rawLabel?.trim()?.take(MAX_LABEL_LENGTH)?.ifBlank { null }
            ?: access.user.displayName?.take(MAX_LABEL_LENGTH)?.ifBlank { null }
            ?: DEFAULT_LABEL
        val session = kioskSessionRepository.save(
            KioskSessionEntity(
                label = label,
                pinHash = requireNotNull(encoder.encode(pin)),
                startedBy = access.user,
                startedAt = Instant.now(clock)
            )
        )
        auditService.recordKioskAction(access.user, AuditService.ACTION_KIOSK_STARTED, session.id, null)
        log.info("kiosk session started id={} by={}", session.id, access.user.id)
        return toDto(session)
    }

    /** Zustand einer Sitzung für das Gerät, das sie gestartet hat. */
    @Transactional(readOnly = true)
    fun state(id: UUID, principal: UserPrincipal): KioskSessionDto {
        requireKioskAccess(principal)
        return toDto(find(id))
    }

    @Transactional
    fun unlock(id: UUID, rawPin: String?, principal: UserPrincipal): KioskUnlockResultDto {
        val access = requireKioskAccess(principal)
        val session = kioskSessionRepository.findByIdForUpdate(id).orElseThrow { notFound(id) }
        // Schon beendet (etwa aus der Ferne): das Gerät darf den Modus verlassen.
        if (!session.active) return KioskUnlockResultDto(unlocked = true, remainingAttempts = null, lockedUntil = null)

        val now = Instant.now(clock)
        if (session.isLocked(now)) {
            return KioskUnlockResultDto(unlocked = false, remainingAttempts = 0, lockedUntil = session.lockedUntil)
        }

        val pin = rawPin?.trim().orEmpty()
        if (pin.length <= MAX_PIN_LENGTH && encoder.matches(pin, session.pinHash)) {
            session.endedAt = now
            session.endedBy = access.user
            session.endReason = KioskSessionEntity.END_REASON_PIN
            session.lockedUntil = null
            kioskSessionRepository.save(session)
            log.info("kiosk session unlocked id={} by={}", session.id, access.user.id)
            return KioskUnlockResultDto(unlocked = true, remainingAttempts = null, lockedUntil = null)
        }

        session.failedAttempts += 1
        if (session.failedAttempts < MAX_FAILED_ATTEMPTS) {
            kioskSessionRepository.save(session)
            log.info("kiosk unlock failed id={} attempts={}", session.id, session.failedAttempts)
            return KioskUnlockResultDto(
                unlocked = false,
                remainingAttempts = MAX_FAILED_ATTEMPTS - session.failedAttempts,
                lockedUntil = null
            )
        }

        val step = LOCKOUT_STEPS[session.lockoutCount.coerceAtMost(LOCKOUT_STEPS.size - 1)]
        session.failedAttempts = 0
        session.lockoutCount += 1
        session.lockedUntil = now.plus(step)
        kioskSessionRepository.save(session)
        auditService.recordKioskAction(
            access.user,
            AuditService.ACTION_KIOSK_PIN_LOCKED,
            session.id,
            "durationMinutes=${step.toMinutes()}"
        )
        log.warn("kiosk pin locked id={} until={}", session.id, session.lockedUntil)
        return KioskUnlockResultDto(unlocked = false, remainingAttempts = 0, lockedUntil = session.lockedUntil)
    }

    /** Laufende Sitzungen für die Geräteübersicht (nur Vorstand und Administration). */
    @Transactional(readOnly = true)
    fun listActive(principal: UserPrincipal): List<KioskSessionDto> {
        requireManager(principal)
        return kioskSessionRepository.findByEndedAtIsNullOrderByStartedAtAsc().map { toDto(it) }
    }

    /** Beendet eine Sitzung aus der Ferne, ohne PIN (nur Vorstand und Administration). */
    @Transactional
    fun endRemotely(id: UUID, principal: UserPrincipal): KioskSessionDto {
        val caller = requireManager(principal)
        val session = kioskSessionRepository.findByIdForUpdate(id).orElseThrow { notFound(id) }
        if (session.active) {
            session.endedAt = Instant.now(clock)
            session.endedBy = caller
            session.endReason = KioskSessionEntity.END_REASON_REMOTE
            session.lockedUntil = null
            kioskSessionRepository.save(session)
            auditService.recordKioskAction(caller, AuditService.ACTION_KIOSK_ENDED_REMOTELY, session.id, null)
            log.info("kiosk session ended remotely id={} by={}", session.id, caller.id)
        }
        return toDto(session)
    }

    private data class KioskAccess(val user: UserEntity, val manager: Boolean)

    private fun find(id: UUID): KioskSessionEntity =
        kioskSessionRepository.findById(id).orElseThrow { notFound(id) }

    private fun notFound(id: UUID) =
        ResourceNotFoundException(Msg("error.kiosk.notFound", id), ErrorCode.NOT_FOUND)

    private fun requireManager(principal: UserPrincipal): UserEntity {
        val access = requireKioskAccess(principal)
        if (!access.manager) {
            throw AccessDeniedException(Msg("error.kiosk.manageDenied"), ErrorCode.ACCESS_DENIED)
        }
        return access.user
    }

    /** Terminal (`purchase.tablet`) oder Kiosk-Verwaltung (`kiosk.manage`); sonst `403`. */
    private fun requireKioskAccess(principal: UserPrincipal): KioskAccess {
        val user = userService.getOrCreateUser(principal)
        val permissions = access.permissionsOf(principal, user)
        val manager = permissions.contains(Permission.KIOSK_MANAGE)
        if (!manager && !permissions.contains(Permission.PURCHASE_TABLET)) {
            throw AccessDeniedException(Msg("error.kiosk.accessDenied"), ErrorCode.ACCESS_DENIED)
        }
        return KioskAccess(user, manager)
    }

    private fun toDto(session: KioskSessionEntity) = KioskSessionDto(
        id = session.id.toString(),
        label = session.label,
        startedByName = session.startedBy?.displayName,
        startedAt = session.startedAt,
        active = session.active,
        endReason = session.endReason,
        lockedUntil = session.lockedUntil
    )

    companion object {
        const val MIN_PIN_LENGTH = 4
        const val MAX_PIN_LENGTH = 8
        const val MAX_FAILED_ATTEMPTS = 5
        const val MAX_LABEL_LENGTH = 60
        const val DEFAULT_LABEL = "Thekenterminal"
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
