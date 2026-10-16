package de.maurer.baseservice.service

import de.maurer.baseservice.domain.AuditLogEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AuditLogDto
import de.maurer.baseservice.dto.PagedResponse
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.repository.AuditLogRepository
import de.maurer.baseservice.repository.KioskSessionRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.NotificationRepository
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.BoardRole
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.support.Identifiers
import jakarta.persistence.criteria.Predicate
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.data.jpa.domain.Specification
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Lesender Zugriff auf das append-only Audit-Protokoll (`audit_logs`) für
 * Vorstand und Administration (TICKET-022).
 *
 * Autorisierung folgt `deny by default`: Ohne die fachliche Berechtigung
 * `audit.read` (Vorstand/Admin) erhält niemand Einsicht. Die sichtbaren
 * Zielarten werden zusätzlich fein granular je Vorstands-Unterrolle begrenzt,
 * sodass Unterrollen nur ihren erlaubten Bereich sehen:
 *
 * - Administration: alle Bereiche (`User`, `Ledger`, `Notification`).
 * - Vorsitz und allgemeiner Vorstand (ohne Unterrolle): Finanzen (`Ledger`) und
 *   Kommunikation (`Notification`), aber keine Benutzeradministration (`User`).
 * - Kassenwart: ausschließlich Finanzen (`Ledger`).
 * - Schriftführer: ausschließlich Kommunikation (`Notification`).
 * - Beisitzer: keine privilegierten Bereiche.
 *
 * Das Protokoll wird nur gelesen; geschrieben wird es ausschließlich über den
 * [AuditService] aus den privilegierten Fachaktionen.
 */
@Service
@Transactional(readOnly = true)
class AuditLogService(
    private val auditLogRepository: AuditLogRepository,
    private val userService: UserService,
    private val access: StammtischAccess,
    private val memberRepository: StammtischMemberRepository,
    private val userRepository: UserRepository,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val notificationRepository: NotificationRepository,
    private val kioskSessionRepository: KioskSessionRepository
) {

    /**
     * Paginierte, gefilterte und chronologisch absteigend sortierte Sicht auf das
     * Audit-Protokoll. Ein explizit angeforderter Bereich (`targetEntity`), der
     * für den Aufrufer nicht sichtbar ist, wird mit `deny by default` abgewiesen.
     */
    fun listAuditLogs(
        targetEntity: String?,
        action: String?,
        actorId: String?,
        targetId: String?,
        pageable: Pageable?,
        principal: UserPrincipal
    ): PagedResponse<AuditLogDto> {
        val caller = userService.getOrCreateUser(principal)

        val visibleTargets = visibleTargetsFor(caller, principal)
        if (visibleTargets.isEmpty()) {
            throw AccessDeniedException(
                Msg("error.audit.readDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }

        val requestedTargets = resolveRequestedTargets(targetEntity, visibleTargets)
        val actorUuid = actorId?.let { Identifiers.parseUuid(it, "actorId") }
        val actionFilter = action?.trim()?.ifBlank { null }
        val targetIdFilter = targetId?.trim()?.ifBlank { null }

        val effectivePageable = normalizePageable(pageable)
        val page: Page<AuditLogEntity> = auditLogRepository.findAll(
            auditSpecification(requestedTargets, actionFilter, actorUuid, targetIdFilter),
            effectivePageable
        )

        return PagedResponse(
            content = toDtos(page.content),
            page = page.number,
            size = page.size,
            totalElements = page.totalElements,
            totalPages = page.totalPages,
            sort = effectivePageable.sort.map { "${it.property},${it.direction.name.lowercase()}" }.toList()
        )
    }

    private fun resolveRequestedTargets(targetEntity: String?, visibleTargets: Set<String>): Set<String> {
        if (targetEntity == null) {
            return visibleTargets
        }
        val normalized = targetEntity.trim()
        if (normalized.isBlank()) {
            throw InvalidRequestException(Msg("error.field.blank", "targetEntity"), ErrorCode.INVALID_REQUEST)
        }
        if (!KNOWN_TARGETS.contains(normalized)) {
            throw InvalidRequestException(Msg("error.audit.unknownTarget", normalized), ErrorCode.INVALID_REQUEST)
        }
        if (!visibleTargets.contains(normalized)) {
            throw AccessDeniedException(
                Msg("error.audit.targetDenied", normalized),
                ErrorCode.ACCESS_DENIED
            )
        }
        return setOf(normalized)
    }

    /**
     * Ermittelt die für den Aufrufer sichtbaren Audit-Zielarten aus Rolle und
     * Vorstands-Unterrolle. Ohne Vorstands-/Adminrolle ist die Menge leer
     * (`deny by default`).
     */
    private fun visibleTargetsFor(caller: UserEntity, principal: UserPrincipal): Set<String> {
        val permissions = access.permissionsOf(principal, caller)
        if (permissions.contains(Permission.AUDIT_READ_ALL)) {
            return setOf(
                AuditService.TARGET_USER,
                AuditService.TARGET_LEDGER,
                AuditService.TARGET_NOTIFICATION,
                AuditService.TARGET_KIOSK
            )
        }
        if (!permissions.contains(Permission.AUDIT_READ)) {
            return emptySet()
        }
        return when (boardRoleOf(caller, principal)) {
            BoardRole.TREASURER -> setOf(AuditService.TARGET_LEDGER)
            BoardRole.SECRETARY -> setOf(AuditService.TARGET_NOTIFICATION)
            BoardRole.CHAIR, null -> setOf(
                AuditService.TARGET_LEDGER,
                AuditService.TARGET_NOTIFICATION,
                AuditService.TARGET_KIOSK
            )
            else -> emptySet()
        }
    }

    private fun auditSpecification(
        targets: Set<String>,
        action: String?,
        actorId: UUID?,
        targetId: String?
    ): Specification<AuditLogEntity> =
        Specification { root, _, builder ->
            val predicates = mutableListOf<Predicate>()

            predicates.add(root.get<String>("targetEntity").`in`(targets))

            if (action != null) {
                predicates.add(builder.equal(root.get<String>("action"), action))
            }
            if (actorId != null) {
                predicates.add(builder.equal(root.get<UserEntity>("actor").get<UUID>("id"), actorId))
            }
            if (targetId != null) {
                predicates.add(builder.equal(root.get<String>("targetId"), targetId))
            }

            builder.and(*predicates.toTypedArray())
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
        // Das Protokoll ist chronologisch; die Reihenfolge wird serverseitig fest vorgegeben.
        return PageRequest.of(pageNumber, size, DEFAULT_SORT)
    }

    /** Vorstandsfunktion der Mitgliedschaft in diesem Stammtisch. */
    private fun boardRoleOf(caller: UserEntity, principal: UserPrincipal): String? {
        memberRepository.findByUserId(caller.id).orElse(null)?.boardRole?.let { return it.name }
        return principal.boardRole?.takeIf { BoardRole.ALL.contains(it) }
    }

    /**
     * Löst die Ziele einer Seite gesammelt zu Namen auf (Mitglied, Empfänger,
     * Betreff), damit Vorstand und Administration keine rohen IDs lesen müssen.
     */
    private fun toDtos(entries: List<AuditLogEntity>): List<AuditLogDto> {
        fun idsOf(target: String) = entries
            .filter { it.targetEntity == target }
            .mapNotNull { entry -> entry.targetId?.let { runCatching { UUID.fromString(it) }.getOrNull() } }
            .toSet()

        val userIds = idsOf(AuditService.TARGET_USER)
        val ledgerIds = idsOf(AuditService.TARGET_LEDGER)
        val notificationIds = idsOf(AuditService.TARGET_NOTIFICATION)
        val kioskIds = idsOf(AuditService.TARGET_KIOSK)

        val userNames = if (userIds.isEmpty()) emptyMap() else
            userRepository.findAllById(userIds).associate { it.id.toString() to it.displayName }
        val ledgerMembers = if (ledgerIds.isEmpty()) emptyMap() else
            ledgerEntryRepository.findByIdIn(ledgerIds).associate { it.id.toString() to it.member?.displayName }
        val notifications = if (notificationIds.isEmpty()) emptyMap() else
            notificationRepository.findAllById(notificationIds).associateBy { it.id.toString() }
        val kioskLabels = if (kioskIds.isEmpty()) emptyMap() else
            kioskSessionRepository.findAllById(kioskIds).associate { it.id.toString() to it.label }

        return entries.map { entry ->
            val dto = toDto(entry)
            when (entry.targetEntity) {
                AuditService.TARGET_USER -> dto.copy(targetName = userNames[entry.targetId])
                AuditService.TARGET_LEDGER -> dto.copy(targetName = ledgerMembers[entry.targetId])
                AuditService.TARGET_NOTIFICATION -> notifications[entry.targetId]
                    ?.let { dto.copy(targetName = it.user?.displayName, targetTitle = it.title) }
                    ?: dto
                AuditService.TARGET_KIOSK -> dto.copy(targetName = kioskLabels[entry.targetId])
                else -> dto
            }
        }
    }

    private fun toDto(entry: AuditLogEntity): AuditLogDto = AuditLogDto(
        id = entry.id.toString(),
        action = entry.action,
        targetEntity = entry.targetEntity,
        targetId = entry.targetId,
        actorId = entry.actor?.id?.toString(),
        actorDisplayName = entry.actor?.displayName,
        details = entry.details,
        createdAt = entry.createdAt
    )

    companion object {
        const val DEFAULT_PAGE_SIZE = 20
        const val MAX_PAGE_SIZE = 100
        val DEFAULT_SORT: Sort = Sort.by(Sort.Direction.DESC, "createdAt")

        /** Bekannte Audit-Zielarten gemäß [AuditService]. */
        val KNOWN_TARGETS: Set<String> = setOf(
            AuditService.TARGET_USER,
            AuditService.TARGET_LEDGER,
            AuditService.TARGET_NOTIFICATION
        )
    }
}
