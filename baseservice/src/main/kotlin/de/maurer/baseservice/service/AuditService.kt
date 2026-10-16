package de.maurer.baseservice.service

import de.maurer.baseservice.domain.AuditLogEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.AuditLogRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Protokollierung sicherheitsrelevanter Änderungen (Rollen, Permissions, Status).
 *
 * Struktur und Aktionsnamen sind mit dem Audit-Log aus TICKET-022 abzustimmen;
 * die Ablage erfolgt in `audit_logs` mit Akteur, Zielbenutzer, altem und neuem
 * Wert sowie Zeitstempel (`created_at` über JPA-Auditing).
 */
@Service
@Transactional
class AuditService(
    private val auditLogRepository: AuditLogRepository
) {

    private val log = LoggerFactory.getLogger(AuditService::class.java)

    fun recordUserChange(
        actor: UserEntity?,
        action: String,
        targetUserId: UUID,
        oldValue: Any?,
        newValue: Any?
    ) {
        val details = "old=${render(oldValue)}; new=${render(newValue)}"
        auditLogRepository.save(
            AuditLogEntity(
                id = UUID.randomUUID(),
                actor = actor,
                action = action,
                targetEntity = TARGET_USER,
                targetId = targetUserId.toString(),
                details = details
            )
        )
        log.info("audit action={} actor={} target={} {}", action, actor?.id, targetUserId, details)
    }

    /**
     * Protokolliert eine finanzielle Buchung (Topup, Payout, Korrektur) mit Akteur,
     * Ziel-Buchung und einer nachvollziehbaren Kurzbeschreibung (TICKET-015).
     */
    fun recordLedgerEntry(
        actor: UserEntity?,
        action: String,
        ledgerEntryId: UUID,
        details: String
    ) {
        auditLogRepository.save(
            AuditLogEntity(
                id = UUID.randomUUID(),
                actor = actor,
                action = action,
                targetEntity = TARGET_LEDGER,
                targetId = ledgerEntryId.toString(),
                details = details
            )
        )
        log.info("audit action={} actor={} target={} {}", action, actor?.id, ledgerEntryId, details)
    }

    /**
     * Protokolliert den Versand einer Benachrichtigung an ein Mitglied (TICKET-020)
     * mit Akteur, Ziel-Benachrichtigung und einer nachvollziehbaren Kurzbeschreibung.
     */
    fun recordNotification(
        actor: UserEntity?,
        action: String,
        notificationId: UUID,
        details: String
    ) {
        auditLogRepository.save(
            AuditLogEntity(
                id = UUID.randomUUID(),
                actor = actor,
                action = action,
                targetEntity = TARGET_NOTIFICATION,
                targetId = notificationId.toString(),
                details = details
            )
        )
        log.info("audit action={} actor={} target={} {}", action, actor?.id, notificationId, details)
    }

    /**
     * Protokolliert Aktionen rund um Gemeinschaftsmomente (Start, Abschluss/Archivierung).
     */
    fun recordMomentAction(
        actor: UserEntity?,
        action: String,
        momentId: UUID,
        details: String
    ) {
        auditLogRepository.save(
            AuditLogEntity(
                id = UUID.randomUUID(),
                actor = actor,
                action = action,
                targetEntity = TARGET_MOMENT,
                targetId = momentId.toString(),
                details = details
            )
        )
        log.info("audit action={} actor={} target={} {}", action, actor?.id, momentId, details)
    }

    /** Protokolliert Änderungen an Moment-Typen und -Reaktionen durch den Vorstand. */
    fun recordMomentConfigChange(actor: UserEntity?, action: String, targetId: UUID, details: String) {
        auditLogRepository.save(
            AuditLogEntity(
                id = UUID.randomUUID(),
                actor = actor,
                action = action,
                targetEntity = TARGET_MOMENT_CONFIG,
                targetId = targetId.toString(),
                details = details
            )
        )
        log.info("audit action={} actor={} target={} {}", action, actor?.id, targetId, details)
    }

    /** Protokolliert Kiosk-Sitzungen am Thekenterminal (Start, Fernentsperrung, PIN-Sperre). */
    fun recordKioskAction(
        actor: UserEntity?,
        action: String,
        kioskSessionId: UUID,
        details: String?
    ) {
        auditLogRepository.save(
            AuditLogEntity(
                id = UUID.randomUUID(),
                actor = actor,
                action = action,
                targetEntity = TARGET_KIOSK,
                targetId = kioskSessionId.toString(),
                details = details
            )
        )
        log.info("audit action={} actor={} target={} {}", action, actor?.id, kioskSessionId, details)
    }

    /** Protokolliert Änderungen am Stammtisch selbst (Name, Rollen) und seine Anlage. */
    fun recordStammtischChange(actor: UserEntity?, action: String, targetId: UUID, details: String) {
        auditLogRepository.save(
            AuditLogEntity(
                id = UUID.randomUUID(),
                actor = actor,
                action = action,
                targetEntity = TARGET_STAMMTISCH,
                targetId = targetId.toString(),
                details = details
            )
        )
        log.info("audit action={} actor={} target={} {}", action, actor?.id, targetId, details)
    }

    private fun render(value: Any?): String = when (value) {
        null -> "-"
        is Collection<*> -> value.map { it.toString() }.sorted().joinToString(",")
        else -> value.toString()
    }

    companion object {
        const val TARGET_USER = "User"
        const val TARGET_STAMMTISCH = "Stammtisch"
        const val ACTION_STAMMTISCH_CREATED = "STAMMTISCH_CREATED"
        const val ACTION_STAMMTISCH_RENAMED = "STAMMTISCH_RENAMED"
        const val ACTION_STAMMTISCH_ROLE_CHANGED = "STAMMTISCH_ROLE_CHANGED"
        const val ACTION_MEMBER_LEFT = "MEMBER_LEFT"
        const val TARGET_LEDGER = "Ledger"
        const val TARGET_NOTIFICATION = "Notification"
        const val TARGET_MOMENT = "Moment"
        const val TARGET_KIOSK = "Kiosk"
        const val TARGET_MOMENT_CONFIG = "MomentConfig"
        const val ACTION_MOMENT_TYPE_SAVED = "MOMENT_TYPE_SAVED"
        const val ACTION_MOMENT_REACTION_SAVED = "MOMENT_REACTION_SAVED"
        const val ACTION_MOMENT_MEDIA_REMOVED = "MOMENT_MEDIA_REMOVED"
        const val ACTION_KIOSK_STARTED = "KIOSK_STARTED"
        const val ACTION_KIOSK_ENDED_REMOTELY = "KIOSK_ENDED_REMOTELY"
        const val ACTION_KIOSK_PIN_LOCKED = "KIOSK_PIN_LOCKED"
        const val ACTION_NOTIFICATION_SENT = "NOTIFICATION_SENT"
        const val ACTION_MOMENT_STARTED = "MOMENT_STARTED"
        const val ACTION_MOMENT_COMPLETED = "MOMENT_COMPLETED"
        const val ACTION_ROLES_CHANGED = "USER_ROLES_CHANGED"
        const val ACTION_PERMISSIONS_CHANGED = "USER_PERMISSIONS_CHANGED"
        const val ACTION_STATUS_CHANGED = "USER_STATUS_CHANGED"
        const val ACTION_PROFILE_ADMIN_UPDATED = "USER_PROFILE_ADMIN_UPDATED"
        const val ACTION_MEMBER_REGISTERED = "USER_REGISTERED_BY_INVITE"
        const val ACTION_MEMBER_JOINED = "MEMBER_JOINED_BY_INVITE"
        const val ACTION_LEDGER_TOPUP = "LEDGER_TOPUP"
        const val ACTION_LEDGER_PAYOUT = "LEDGER_PAYOUT"
        const val ACTION_LEDGER_CORRECTION = "LEDGER_CORRECTION"
        const val ACTION_LEDGER_PURCHASE = "LEDGER_PURCHASE"
    }
}
