package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.BlockedUserDto
import de.maurer.baseservice.dto.CreateReportRequest
import de.maurer.baseservice.dto.ReportCreatedDto
import de.maurer.baseservice.dto.ReportDto
import de.maurer.baseservice.dto.ResolveReportRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.BlockService
import de.maurer.baseservice.service.ReportService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * Melden und Blockieren (#153).
 *
 * - `/api/v1/blocks…` läuft ohne gewählte Gruppe (gilt über alle Gruppen).
 * - Meldungen zu Chatnachrichten hängen am Chat (`/conversations/…`, Gruppe
 *   über Cookie oder Chat-Header), zu Moments am Moment der gewählten Gruppe,
 *   zu Direktnachrichten am Direktchat (ohne Gruppe).
 * - `/api/v1/reports` ist die Liste der Gruppe, `/api/v1/platform/reports`
 *   die der Anwendungs-Administration.
 */
@RestController
@Tag(name = "Moderation", description = "Personen blockieren, Inhalte melden und Meldungen bearbeiten")
class ModerationController(
    private val blockService: BlockService,
    private val reportService: ReportService,
    private val authContext: AuthContext
) {

    private fun id(value: String, field: String) = Identifiers.parseUuid(value, field)

    // --- Blockieren ---

    @GetMapping("/api/v1/blocks")
    @Operation(summary = "Blockierte Personen", description = "Eigene Liste, neueste zuerst")
    fun blocks(): ResponseEntity<List<BlockedUserDto>> =
        ResponseEntity.ok(blockService.list(authContext.getRequiredPrincipal()))

    @PutMapping("/api/v1/blocks/{userId}")
    @Operation(summary = "Person blockieren", description = "Blendet ihre Inhalte aus, sperrt Direktnachrichten und beendet eine Freundschaft")
    fun block(@PathVariable userId: String): ResponseEntity<BlockedUserDto> =
        ResponseEntity.ok(blockService.block(userId, authContext.getRequiredPrincipal()))

    @DeleteMapping("/api/v1/blocks/{userId}")
    @Operation(summary = "Blockierung aufheben")
    fun unblock(@PathVariable userId: String): ResponseEntity<Void> {
        blockService.unblock(userId, authContext.getRequiredPrincipal())
        return ResponseEntity.noContent().build()
    }

    // --- Melden ---

    @PostMapping("/api/v1/conversations/{conversationId}/messages/{messageId}/report")
    @Operation(summary = "Chatnachricht melden", description = "Geht an die Verwaltung der Gruppe")
    fun reportChatMessage(
        @PathVariable conversationId: String,
        @PathVariable messageId: String,
        @Valid @RequestBody request: CreateReportRequest
    ): ResponseEntity<ReportCreatedDto> = ResponseEntity.ok(
        reportService.reportChatMessage(
            id(conversationId, "conversationId"),
            id(messageId, "messageId"),
            request,
            authContext.getRequiredPrincipal()
        )
    )

    @PostMapping("/api/v1/moments/{momentId}/report")
    @Operation(summary = "Moment melden", description = "Geht an die Verwaltung der Gruppe")
    fun reportMoment(
        @PathVariable momentId: String,
        @Valid @RequestBody request: CreateReportRequest
    ): ResponseEntity<ReportCreatedDto> = ResponseEntity.ok(
        reportService.reportMoment(id(momentId, "momentId"), request, authContext.getRequiredPrincipal())
    )

    @PostMapping("/api/v1/moments/{momentId}/responses/{responseId}/report")
    @Operation(summary = "Antwort auf einen Moment melden", description = "Geht an die Verwaltung der Gruppe")
    fun reportMomentResponse(
        @PathVariable momentId: String,
        @PathVariable responseId: String,
        @Valid @RequestBody request: CreateReportRequest
    ): ResponseEntity<ReportCreatedDto> = ResponseEntity.ok(
        reportService.reportMomentResponse(
            id(momentId, "momentId"),
            id(responseId, "responseId"),
            request,
            authContext.getRequiredPrincipal()
        )
    )

    @PostMapping("/api/v1/direct-conversations/{conversationId}/messages/{messageId}/report")
    @Operation(summary = "Direktnachricht melden", description = "Geht an die Anwendungs-Administration")
    fun reportDirectMessage(
        @PathVariable conversationId: String,
        @PathVariable messageId: String,
        @Valid @RequestBody request: CreateReportRequest
    ): ResponseEntity<ReportCreatedDto> = ResponseEntity.ok(
        reportService.reportDirectMessage(
            id(conversationId, "conversationId"),
            id(messageId, "messageId"),
            request,
            authContext.getRequiredPrincipal()
        )
    )

    // --- Bearbeiten ---

    @GetMapping("/api/v1/reports")
    @Operation(summary = "Meldungen der Gruppe", description = "Offene Meldungen; mit all=true auch erledigte (chat.moderate oder members.manage)")
    fun groupReports(@RequestParam(name = "all", defaultValue = "false") all: Boolean): ResponseEntity<List<ReportDto>> =
        ResponseEntity.ok(reportService.groupReports(authContext.getRequiredPrincipal(), all))

    @GetMapping("/api/v1/reports/open-count")
    @Operation(summary = "Zahl offener Meldungen", description = "0 für Personen ohne Moderationsrecht")
    fun openCount(): ResponseEntity<Map<String, Long>> =
        ResponseEntity.ok(mapOf("open" to reportService.openGroupReportCount(authContext.getRequiredPrincipal())))

    @PostMapping("/api/v1/reports/{reportId}/resolve")
    @Operation(summary = "Meldung erledigen", description = "removed entfernt den Inhalt, dismissed schließt ohne Folgen")
    fun resolveGroupReport(
        @PathVariable reportId: String,
        @RequestBody request: ResolveReportRequest
    ): ResponseEntity<ReportDto> = ResponseEntity.ok(
        reportService.resolveGroupReport(id(reportId, "reportId"), request, authContext.getRequiredPrincipal())
    )

    @GetMapping("/api/v1/platform/reports")
    @Operation(summary = "Meldungen zu Direktnachrichten", description = "Nur Anwendungs-Administration")
    fun platformReports(@RequestParam(name = "all", defaultValue = "false") all: Boolean): ResponseEntity<List<ReportDto>> =
        ResponseEntity.ok(reportService.platformReports(authContext.getRequiredPrincipal(), all))

    @PostMapping("/api/v1/platform/reports/{reportId}/resolve")
    @Operation(summary = "Meldung zu einer Direktnachricht erledigen", description = "Nur Anwendungs-Administration")
    fun resolvePlatformReport(
        @PathVariable reportId: String,
        @RequestBody request: ResolveReportRequest
    ): ResponseEntity<ReportDto> = ResponseEntity.ok(
        reportService.resolvePlatformReport(id(reportId, "reportId"), request, authContext.getRequiredPrincipal())
    )
}
