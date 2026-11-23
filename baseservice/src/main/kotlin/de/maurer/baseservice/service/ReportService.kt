package de.maurer.baseservice.service

import de.maurer.baseservice.domain.ContentReportEntity
import de.maurer.baseservice.domain.DirectReportEntity
import de.maurer.baseservice.domain.ReportReason
import de.maurer.baseservice.domain.ReportResolution
import de.maurer.baseservice.domain.ReportStatus
import de.maurer.baseservice.domain.ReportTargetType
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateReportRequest
import de.maurer.baseservice.dto.ReportCreatedDto
import de.maurer.baseservice.dto.ReportDto
import de.maurer.baseservice.dto.ResolveReportRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.ChatMediaRepository
import de.maurer.baseservice.repository.ChatMessageRepository
import de.maurer.baseservice.repository.ContentReportRepository
import de.maurer.baseservice.repository.ConversationRepository
import de.maurer.baseservice.repository.DirectMediaRepository
import de.maurer.baseservice.repository.DirectMessageRepository
import de.maurer.baseservice.repository.DirectReportRepository
import de.maurer.baseservice.repository.MomentMediaRepository
import de.maurer.baseservice.repository.MomentResponseRepository
import de.maurer.baseservice.repository.MomentSessionRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.Instant
import java.util.UUID

/**
 * Melden von Inhalten (#153).
 *
 * - **Gruppeninhalte** (Chatnachrichten in Gruppen-, Event- und Moment-Chats,
 *   Moments, Antworten auf Moments) landen in `content_reports` der Gruppe.
 *   Bearbeiten dürfen alle mit `chat.moderate` oder `members.manage`.
 * - **Direktnachrichten** gehören keiner Gruppe; ihre Meldungen landen in
 *   `direct_reports` und gehen an die Anwendungs-Administration
 *   (Keycloak-Rolle `admin`). Mit der Meldung gibt die meldende Person den
 *   Auszug der Nachricht dafür frei.
 *
 * Melden darf nur, wer den Inhalt selbst sehen darf. Eigene Inhalte lassen
 * sich nicht melden. Jede Meldung speichert einen verschlüsselten Auszug,
 * damit die Verwaltung sie auch beurteilen kann, wenn der Inhalt später
 * verschwindet. „Entfernen“ löscht den Inhalt samt Fotos und Videos und
 * schließt alle offenen Meldungen dazu.
 */
@Service
@Transactional
class ReportService(
    private val userService: UserService,
    private val access: StammtischAccess,
    private val chatService: ChatService,
    private val momentService: MomentService,
    private val directMessageService: DirectMessageService,
    private val contentReportRepository: ContentReportRepository,
    private val directReportRepository: DirectReportRepository,
    private val chatMessageRepository: ChatMessageRepository,
    private val chatMediaRepository: ChatMediaRepository,
    private val conversationRepository: ConversationRepository,
    private val momentSessionRepository: MomentSessionRepository,
    private val momentResponseRepository: MomentResponseRepository,
    private val momentMediaRepository: MomentMediaRepository,
    private val directMessageRepository: DirectMessageRepository,
    private val directMediaRepository: DirectMediaRepository,
    private val mediaStore: MediaStore,
    private val auditService: AuditService
) {

    // --- Melden ---

    fun reportChatMessage(conversationId: UUID, messageId: UUID, request: CreateReportRequest, principal: UserPrincipal): ReportCreatedDto {
        val caller = userService.getOrCreateUser(principal)
        val conversation = chatService.requireReadableConversation(conversationId, caller, principal)
        val message = chatMessageRepository.findById(messageId)
            .filter { it.conversation?.id == conversation.id }
            .orElseThrow { notFound() }
        return createGroupReport(caller, ReportTargetType.chat_message, message.id, message.sender, message.message, request)
    }

    fun reportMoment(momentId: UUID, request: CreateReportRequest, principal: UserPrincipal): ReportCreatedDto {
        val momentAccess = momentService.requireMomentAccess(momentId, principal, requireActive = false)
        val session = momentAccess.session
        val excerpt = listOfNotNull(session.title, session.message).joinToString(" – ")
        return createGroupReport(momentAccess.caller, ReportTargetType.moment, session.id, session.creator, excerpt, request)
    }

    fun reportMomentResponse(momentId: UUID, responseId: UUID, request: CreateReportRequest, principal: UserPrincipal): ReportCreatedDto {
        val momentAccess = momentService.requireMomentAccess(momentId, principal, requireActive = false)
        val response = momentResponseRepository.findById(responseId)
            .filter { it.moment?.id == momentAccess.session.id }
            .orElseThrow { notFound() }
        val excerpt = listOfNotNull(response.reaction, response.statusText).joinToString(" ")
        return createGroupReport(momentAccess.caller, ReportTargetType.moment_response, response.id, response.user, excerpt, request)
    }

    fun reportDirectMessage(conversationId: UUID, messageId: UUID, request: CreateReportRequest, principal: UserPrincipal): ReportCreatedDto {
        val caller = userService.getOrCreateUser(principal)
        val conversation = directMessageService.requireReadableDirect(conversationId, caller)
        val message = directMessageRepository.findById(messageId)
            .filter { it.conversation?.id == conversation.id }
            .orElseThrow { notFound() }
        val author = message.sender
        requireNotOwn(caller, author)
        val reason = parseReason(request.reason)
        if (!directReportRepository.existsByReporterIdAndTargetIdAndStatus(caller.id, message.id, ReportStatus.open)) {
            directReportRepository.save(
                DirectReportEntity(
                    reporter = caller,
                    targetType = ReportTargetType.direct_message,
                    targetId = message.id,
                    targetUser = author,
                    reason = reason,
                    note = request.note?.trim()?.ifBlank { null }?.take(MAX_NOTE),
                    excerpt = message.message.take(MAX_EXCERPT)
                )
            )
        }
        return ReportCreatedDto(message.id.toString(), HANDLED_BY_PLATFORM)
    }

    private fun createGroupReport(
        caller: UserEntity,
        type: ReportTargetType,
        targetId: UUID,
        author: UserEntity?,
        excerpt: String?,
        request: CreateReportRequest
    ): ReportCreatedDto {
        requireNotOwn(caller, author)
        val reason = parseReason(request.reason)
        // Wer denselben Inhalt nochmal meldet, legt keine zweite offene Meldung an.
        if (!contentReportRepository.existsByReporterIdAndTargetTypeAndTargetIdAndStatus(caller.id, type, targetId, ReportStatus.open)) {
            contentReportRepository.save(
                ContentReportEntity(
                    reporter = caller,
                    targetType = type,
                    targetId = targetId,
                    targetUser = author,
                    reason = reason,
                    note = request.note?.trim()?.ifBlank { null }?.take(MAX_NOTE),
                    excerpt = excerpt?.trim()?.ifBlank { null }?.take(MAX_EXCERPT)
                )
            )
        }
        return ReportCreatedDto(targetId.toString(), HANDLED_BY_GROUP)
    }

    // --- Verwaltung der Gruppe ---

    @Transactional(readOnly = true)
    fun groupReports(principal: UserPrincipal, includeResolved: Boolean): List<ReportDto> {
        requireModerator(principal)
        val reports = if (includeResolved) {
            contentReportRepository.findAllByOrderByCreatedAtDesc()
        } else {
            contentReportRepository.findByStatusOrderByCreatedAtDesc(ReportStatus.open)
        }
        return reports.map { toDto(it, contextOf(it.targetType, it.targetId)) }
    }

    @Transactional(readOnly = true)
    fun openGroupReportCount(principal: UserPrincipal): Long {
        val caller = userService.getOrCreateUser(principal)
        if (!isModerator(principal, caller)) return 0
        return contentReportRepository.countByStatus(ReportStatus.open)
    }

    fun resolveGroupReport(reportId: UUID, request: ResolveReportRequest, principal: UserPrincipal): ReportDto {
        val caller = requireModerator(principal)
        val report = contentReportRepository.findById(reportId).orElseThrow { notFound() }
        val resolution = parseResolution(request.resolution)
        val related = contentReportRepository.findByTargetTypeAndTargetIdAndStatus(report.targetType, report.targetId, ReportStatus.open)
        if (resolution == ReportResolution.removed) {
            removeGroupContent(report.targetType, report.targetId)
            (related + report).distinctBy { it.id }.forEach { close(it, caller, resolution) }
        } else {
            close(report, caller, resolution)
        }
        auditService.recordStammtischChange(
            caller,
            if (resolution == ReportResolution.removed) AuditService.ACTION_REPORT_CONTENT_REMOVED else AuditService.ACTION_REPORT_DISMISSED,
            TenantContext.requireStammtischId(),
            "report=${report.id}; target=${report.targetType.name}:${report.targetId}; reason=${report.reason.name}"
        )
        return toDto(report, contextOf(report.targetType, report.targetId))
    }

    // --- Anwendungs-Administration (Direktnachrichten) ---

    @Transactional(readOnly = true)
    fun platformReports(principal: UserPrincipal, includeResolved: Boolean): List<ReportDto> {
        requirePlatformAdmin(principal)
        val reports = if (includeResolved) {
            directReportRepository.findAllByOrderByCreatedAtDesc()
        } else {
            directReportRepository.findByStatusOrderByCreatedAtDesc(ReportStatus.open)
        }
        return reports.map { report ->
            val message = directMessageRepository.findById(report.targetId).orElse(null)
            toDto(report, message?.conversation?.id, message != null)
        }
    }

    fun resolvePlatformReport(reportId: UUID, request: ResolveReportRequest, principal: UserPrincipal): ReportDto {
        requirePlatformAdmin(principal)
        val caller = userService.getOrCreateUser(principal)
        val report = directReportRepository.findById(reportId).orElseThrow { notFound() }
        val resolution = parseResolution(request.resolution)
        val message = directMessageRepository.findById(report.targetId).orElse(null)
        if (resolution == ReportResolution.removed) {
            message?.let {
                val keys = directMediaRepository.findByMessageIdIn(listOf(it.id)).map { media -> media.storageKey }
                directMessageRepository.delete(it)
                deleteFilesAfterCommit(keys)
            }
            (directReportRepository.findByTargetIdAndStatus(report.targetId, ReportStatus.open) + report)
                .distinctBy { it.id }
                .forEach { close(it, caller, resolution) }
        } else {
            close(report, caller, resolution)
        }
        return toDto(report, message?.conversation?.id, resolution != ReportResolution.removed && message != null)
    }

    // --- Entfernen ---

    private fun removeGroupContent(type: ReportTargetType, targetId: UUID) {
        val keys = mutableListOf<String>()
        when (type) {
            ReportTargetType.chat_message -> chatMessageRepository.findById(targetId).ifPresent { message ->
                keys += chatMediaRepository.findByMessageIdIn(listOf(message.id)).map { it.storageKey }
                chatMessageRepository.delete(message)
            }
            ReportTargetType.moment_response -> momentResponseRepository.findById(targetId).ifPresent { response ->
                keys += momentMediaRepository.findByResponseIdIn(listOf(response.id)).map { it.storageKey }
                momentResponseRepository.delete(response)
            }
            ReportTargetType.moment -> momentSessionRepository.findById(targetId).ifPresent { session ->
                keys += momentMediaRepository.findByMomentId(session.id).map { it.storageKey }
                val chat = session.conversation
                momentSessionRepository.delete(session)
                momentSessionRepository.flush()
                chat?.let { conversation ->
                    keys += chatMediaRepository.findByConversationId(conversation.id).map { it.storageKey }
                    conversationRepository.delete(conversation)
                }
            }
            ReportTargetType.direct_message -> throw InvalidRequestException(Msg("error.report.wrongScope"), ErrorCode.INVALID_REQUEST)
        }
        deleteFilesAfterCommit(keys)
    }

    /** Dateien erst nach erfolgreichem Commit löschen; ein Rollback lässt sie stehen. */
    private fun deleteFilesAfterCommit(keys: List<String>) {
        if (keys.isEmpty()) return
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() = keys.forEach { mediaStore.delete(it) }
            })
        } else {
            keys.forEach { mediaStore.delete(it) }
        }
    }

    // --- Helfer ---

    private fun contextOf(type: ReportTargetType, targetId: UUID): Pair<UUID?, Boolean> = when (type) {
        ReportTargetType.chat_message -> chatMessageRepository.findById(targetId).map { it.conversation?.id to true }.orElse(null to false)
        ReportTargetType.moment -> momentSessionRepository.findById(targetId).map { it.id as UUID? to true }.orElse(null to false)
        ReportTargetType.moment_response -> momentResponseRepository.findById(targetId).map { it.moment?.id to true }.orElse(null to false)
        ReportTargetType.direct_message -> null to false
    }

    private fun close(report: ContentReportEntity, caller: UserEntity, resolution: ReportResolution) {
        if (report.status != ReportStatus.open) return
        report.status = ReportStatus.resolved
        report.resolution = resolution
        report.resolvedBy = caller
        report.resolvedAt = Instant.now()
    }

    private fun close(report: DirectReportEntity, caller: UserEntity, resolution: ReportResolution) {
        if (report.status != ReportStatus.open) return
        report.status = ReportStatus.resolved
        report.resolution = resolution
        report.resolvedBy = caller
        report.resolvedAt = Instant.now()
    }

    private fun toDto(report: ContentReportEntity, context: Pair<UUID?, Boolean>) = ReportDto(
        id = report.id.toString(),
        targetType = report.targetType.name,
        targetId = report.targetId.toString(),
        contextId = context.first?.toString(),
        targetUserId = report.targetUser?.id?.toString(),
        targetUserName = report.targetUser?.displayName,
        reporterName = report.reporter?.displayName ?: ChatService.UNKNOWN_SENDER_NAME,
        reason = report.reason.name,
        note = report.note,
        excerpt = report.excerpt,
        status = report.status.name,
        resolution = report.resolution?.name,
        resolvedByName = report.resolvedBy?.displayName,
        resolvedAt = report.resolvedAt,
        createdAt = report.createdAt,
        contentAvailable = context.second
    )

    private fun toDto(report: DirectReportEntity, contextId: UUID?, available: Boolean) = ReportDto(
        id = report.id.toString(),
        targetType = report.targetType.name,
        targetId = report.targetId.toString(),
        contextId = contextId?.toString(),
        targetUserId = report.targetUser?.id?.toString(),
        targetUserName = report.targetUser?.displayName,
        reporterName = report.reporter?.displayName ?: ChatService.UNKNOWN_SENDER_NAME,
        reason = report.reason.name,
        note = report.note,
        excerpt = report.excerpt,
        status = report.status.name,
        resolution = report.resolution?.name,
        resolvedByName = report.resolvedBy?.displayName,
        resolvedAt = report.resolvedAt,
        createdAt = report.createdAt,
        contentAvailable = available
    )

    private fun isModerator(principal: UserPrincipal, caller: UserEntity): Boolean =
        access.hasAny(principal, caller, Permission.CHAT_MODERATE, Permission.MEMBERS_MANAGE)

    private fun requireModerator(principal: UserPrincipal): UserEntity {
        val caller = userService.getOrCreateUser(principal)
        if (!isModerator(principal, caller)) {
            throw AccessDeniedException(Msg("error.report.moderateDenied"), ErrorCode.ACCESS_DENIED)
        }
        return caller
    }

    private fun requirePlatformAdmin(principal: UserPrincipal) {
        if (!principal.platformAdmin) {
            throw AccessDeniedException(Msg("error.stammtisch.platformAdminRequired"), ErrorCode.ACCESS_DENIED)
        }
    }

    private fun requireNotOwn(caller: UserEntity, author: UserEntity?) {
        if (author?.id == caller.id) {
            throw InvalidRequestException(Msg("error.report.own"), ErrorCode.INVALID_REQUEST)
        }
    }

    private fun parseReason(value: String?): ReportReason =
        ReportReason.entries.firstOrNull { it.name == value?.trim() }
            ?: throw InvalidRequestException(Msg("error.report.reason"), ErrorCode.INVALID_REQUEST)

    private fun parseResolution(value: String?): ReportResolution =
        ReportResolution.entries.firstOrNull { it.name == value?.trim() }
            ?: throw InvalidRequestException(Msg("error.report.resolution"), ErrorCode.INVALID_REQUEST)

    private fun notFound() = ResourceNotFoundException(Msg("error.report.targetNotFound"), ErrorCode.NOT_FOUND)

    companion object {
        const val HANDLED_BY_GROUP = "group"
        const val HANDLED_BY_PLATFORM = "platform"
        private const val MAX_NOTE = 1000
        private const val MAX_EXCERPT = 2000
    }
}
