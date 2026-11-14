package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.AuditLogDto
import de.maurer.baseservice.dto.PagedResponse
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.AuditLogService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.data.domain.Pageable
import org.springframework.data.web.PageableDefault
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * Lesender Zugriff auf das Audit-Protokoll für Vorstand und Administration
 * (TICKET-022). Jede Anfrage wird serverseitig autorisiert (`deny by default`);
 * die sichtbaren Bereiche hängen fein granular von der Vorstands-Unterrolle ab.
 */
@RestController
@RequestMapping("/api/v1/audit-logs")
@Tag(name = "AuditLogs", description = "Audit-Protokoll privilegierter Vorstands- und Adminaktionen")
class AuditLogController(
    private val auditLogService: AuditLogService,
    private val authContext: AuthContext
) {

    @GetMapping
    @Operation(
        summary = "Audit-Logs abrufen",
        description = "Paginierte, gefilterte Sicht auf sicherheitsrelevante Aktionen für Vorstand und Administration"
    )
    fun listAuditLogs(
        @RequestParam(required = false) targetEntity: String?,
        @RequestParam(required = false) action: String?,
        @RequestParam(required = false) actorId: String?,
        @RequestParam(required = false) targetId: String?,
        @PageableDefault(size = AuditLogService.DEFAULT_PAGE_SIZE) pageable: Pageable
    ): ResponseEntity<PagedResponse<AuditLogDto>> {
        val principal = authContext.getRequiredPrincipal()
        val logs = auditLogService.listAuditLogs(
            targetEntity = targetEntity,
            action = action,
            actorId = actorId,
            targetId = targetId,
            pageable = pageable,
            principal = principal
        )
        return ResponseEntity.ok(logs)
    }
}
