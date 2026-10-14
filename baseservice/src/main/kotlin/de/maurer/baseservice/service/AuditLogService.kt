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
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.BoardRole
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
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
    private val userRoleRepository: UserRoleRepository
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
            content = page.content.map { toDto(it) },
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
        val roles = rolesOf(caller, principal)
        if (roles.contains(UserRole.ADMIN)) {
            return setOf(AuditService.TARGET_USER, AuditService.TARGET_LEDGER, AuditService.TARGET_NOTIFICATION)
        }
        if (!roles.contains(UserRole.BOARD)) {
            return emptySet()
        }
        return when (boardRoleOf(caller, principal)) {
            BoardRole.TREASURER -> setOf(AuditService.TARGET_LEDGER)
            BoardRole.SECRETARY -> setOf(AuditService.TARGET_NOTIFICATION)
            BoardRole.CHAIR, null -> setOf(AuditService.TARGET_LEDGER, AuditService.TARGET_NOTIFICATION)
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

    private fun boardRoleOf(caller: UserEntity, principal: UserPrincipal): String? {
        caller.boardRole?.let { return it.name }
        return principal.boardRole?.takeIf { BoardRole.ALL.contains(it) }
    }

    private fun rolesOf(caller: UserEntity, principal: UserPrincipal): Set<String> {
        val dbRoles = userRoleRepository.findByIdUserId(caller.id).map { it.id.role.name }
        return principal.roles + dbRoles
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
