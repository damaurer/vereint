package de.maurer.baseservice.service

import de.maurer.baseservice.domain.*
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.*
import de.maurer.baseservice.repository.*
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.support.Identifiers
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Fachlicher Slice für Gemeinschaftsmomente & Rituale (Moments).
 *
 * Moments ermöglichen interaktive Aktionen während eines Events (gemeinsames Anstoßen,
 * Gebetskreise, Jubeln/Anfeuern, Check-ins).
 *
 * Sicherheits- und Datenschutzregeln (deny by default):
 * - Nur Event-Owner, teilnehmende Mitglieder sowie Vorstand/Admin haben Zugriff auf Momente.
 * - Standortübermittlung erfolgt ausschließlich opt-in mit expliziter Einwilligung (consent=true).
 * - Beim Start eines Moments wird automatisch eine verknüpfte 24h-Chat-Konversation angelegt
 *   und eine Push-/In-App-Benachrichtigung an alle Event-Teilnehmer versendet.
 * - Teilnehmer können mehrfach während der Laufzeit Statusbeiträge und Stimmungen übermitteln.
 * - Nach Ablauf oder manuellem Abschluss wird der Moment in die Event-Historie archiviert.
 */
@Service
@Transactional
class MomentService(
    private val momentSessionRepository: MomentSessionRepository,
    private val momentResponseRepository: MomentResponseRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userService: UserService,
    private val chatService: ChatService,
    private val notificationService: NotificationService,
    private val auditService: AuditService,
    private val momentConfigService: MomentConfigService,
    private val momentMediaRepository: MomentMediaRepository
) {

    /**
     * Startet einen neuen Gemeinschaftsmoment im Kontext eines Events.
     */
    fun startMoment(eventId: UUID, request: StartMomentRequest, principal: UserPrincipal): MomentSessionDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)
        requireEventOpen(event)

        val title = request.title.trim()
        if (title.isBlank()) {
            throw InvalidRequestException(Msg("error.field.blank", "title"), ErrorCode.INVALID_REQUEST)
        }
        val topicType = request.topicType.trim()
        if (topicType.isBlank()) {
            throw InvalidRequestException(Msg("error.field.blank", "topicType"), ErrorCode.INVALID_REQUEST)
        }
        momentConfigService.requireActiveType(topicType)

        validateCoordinatesAndConsent(request.latitude, request.longitude, request.consent)

        val durationMinutes = request.durationMinutes.coerceIn(1, 1440)
        val expiresAt = Instant.now().plus(Duration.ofMinutes(durationMinutes.toLong()))

        val conversation = chatService.createMomentConversation(event, title)

        val session = MomentSessionEntity(
            event = event,
            creator = caller,
            conversation = conversation,
            title = title,
            topicType = topicType,
            message = request.message?.trim()?.ifBlank { null },
            latitude = if (request.consent) request.latitude else null,
            longitude = if (request.consent) request.longitude else null,
            active = true,
            expiresAt = expiresAt
        )
        val saved = momentSessionRepository.save(session)

        // Benachrichtigung & Web-Push an alle Teilnehmer des Events versenden
        val participantUsers = eventParticipantRepository.findByEventId(event.id).mapNotNull { it.user }
        val eventOwner = event.owner
        val recipients = (participantUsers + listOfNotNull(eventOwner))
            .distinctBy { it.id }
            .filter { it.id != caller.id }

        if (recipients.isNotEmpty()) {
            val notifTitle = "Neuer Moment: ${saved.title}"
            val notifBody = "${caller.displayName} hat den Moment '${saved.title}' gestartet. Sei dabei!"
            notificationService.notifyUsers(recipients, notifTitle, notifBody, NOTIFICATION_TYPE_MOMENT)
        }

        auditService.recordMomentAction(
            actor = caller,
            action = AuditService.ACTION_MOMENT_STARTED,
            momentId = saved.id,
            details = "title=${saved.title}; topic=${saved.topicType}; durationMinutes=$durationMinutes"
        )

        return toSessionDto(saved, 0, momentConfigService.labels())
    }

    /**
     * Sendet eine Status- bzw. Stimmungsrückmeldung zu einem aktiven Moment ab.
     * Mehrfache Abgaben desselben Nutzers während der Session sind ausdrücklich zulässig.
     */
    fun submitResponse(
        eventId: UUID,
        momentId: UUID,
        request: SubmitMomentResponseRequest,
        principal: UserPrincipal
    ): MomentResponseDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)
        requireEventOpen(event)

        val session = requireMomentSession(momentId)
        if (session.event?.id != event.id) {
            throw ResourceNotFoundException(Msg("error.moment.wrongEvent", momentId, eventId), ErrorCode.NOT_FOUND)
        }

        if (!session.active || session.expiresAt.isBefore(Instant.now())) {
            if (session.active) {
                completeMomentInternal(session)
            }
            throw InvalidRequestException(Msg("error.moment.notActive"), ErrorCode.INVALID_REQUEST)
        }

        val reaction = request.reaction?.trim()?.ifBlank { null }
        val statusText = request.statusText?.trim()?.ifBlank { null }
        val media = resolveUploadedMedia(session, caller, request.mediaIds)
        if (reaction == null && statusText == null && media.isEmpty()) {
            throw InvalidRequestException(Msg("error.moment.emptyResponse"), ErrorCode.INVALID_REQUEST)
        }
        if (reaction != null) {
            momentConfigService.requireAllowedReaction(session.topicType, reaction)
        }

        validateCoordinatesAndConsent(request.latitude, request.longitude, request.consent)

        val response = MomentResponseEntity(
            moment = session,
            user = caller,
            reaction = reaction,
            statusText = statusText,
            latitude = if (request.consent) request.latitude else null,
            longitude = if (request.consent) request.longitude else null
        )
        val saved = momentResponseRepository.save(response)
        media.forEach {
            it.response = saved
            momentMediaRepository.save(it)
        }
        val canModerate = canModerateMedia(caller, principal, event)
        return toResponseDto(saved, momentConfigService.labels(), media.map { toMediaDto(it, event.id, caller, canModerate) })
    }

    /**
     * Prüft Zugriff auf einen Moment eines Events (Mitglied des Events,
     * Event-Owner oder Vorstand/Admin). Mit [requireActive] muss der Moment noch
     * laufen und das Event offen sein.
     */
    @Transactional
    fun requireMomentAccess(eventId: UUID, momentId: UUID, principal: UserPrincipal, requireActive: Boolean): MomentAccess {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)
        val session = requireMomentSession(momentId)
        if (session.event?.id != event.id) {
            throw ResourceNotFoundException(Msg("error.moment.wrongEvent", momentId, eventId), ErrorCode.NOT_FOUND)
        }
        if (requireActive) {
            requireEventOpen(event)
            if (!session.active || session.expiresAt.isBefore(Instant.now())) {
                if (session.active) completeMomentInternal(session)
                throw InvalidRequestException(Msg("error.moment.notActive"), ErrorCode.INVALID_REQUEST)
            }
        }
        return MomentAccess(caller, event, session, canModerateMedia(caller, principal, event))
    }

    /** Eigene, noch nicht verwendete Uploads dieses Moments. */
    private fun resolveUploadedMedia(session: MomentSessionEntity, caller: UserEntity, ids: List<String>): List<MomentMediaEntity> {
        if (ids.isEmpty()) return emptyList()
        val parsed = ids.map { Identifiers.parseUuid(it, "mediaIds") }.distinct()
        if (parsed.size > MomentMediaService.MAX_MEDIA_PER_RESPONSE) {
            throw InvalidRequestException(Msg("error.momentMedia.tooMany", MomentMediaService.MAX_MEDIA_PER_RESPONSE), ErrorCode.INVALID_REQUEST)
        }
        val media = momentMediaRepository.findAllById(parsed)
        val usable = media.size == parsed.size && media.all {
            it.moment?.id == session.id && it.owner?.id == caller.id && it.response == null
        }
        if (!usable) {
            throw InvalidRequestException(Msg("error.momentMedia.notUsable"), ErrorCode.INVALID_REQUEST)
        }
        // Reihenfolge wie vom Mitglied gewählt.
        return parsed.map { id -> media.first { it.id == id } }
    }

    /**
     * Listet alle aktiven Momente eines Events auf.
     */
    @Transactional
    fun listActiveMoments(eventId: UUID, principal: UserPrincipal): List<MomentSessionDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)

        val sessions = momentSessionRepository.findByEventIdAndActiveTrue(event.id)
        val labels = momentConfigService.labels()
        val now = Instant.now()
        val activeDtos = mutableListOf<MomentSessionDto>()

        for (session in sessions) {
            if (session.expiresAt.isBefore(now)) {
                completeMomentInternal(session)
            } else {
                val count = momentResponseRepository.countByMomentId(session.id).toInt()
                activeDtos.add(toSessionDto(session, count, labels))
            }
        }

        return activeDtos.sortedByDescending { it.createdAt }
    }

    /**
     * Ruft die Detailansicht eines Moments ab (inklusive Antwort-Stream und GeoJSON-Karte).
     */
    @Transactional
    fun getMomentDetail(eventId: UUID, momentId: UUID, principal: UserPrincipal): MomentDetailDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)

        val session = requireMomentSession(momentId)
        if (session.event?.id != event.id) {
            throw ResourceNotFoundException(Msg("error.moment.wrongEvent", momentId, eventId), ErrorCode.NOT_FOUND)
        }

        if (session.active && session.expiresAt.isBefore(Instant.now())) {
            completeMomentInternal(session)
        }

        val responses = momentResponseRepository.findByMomentIdOrderByCreatedAtAsc(session.id)
        val labels = momentConfigService.labels()
        val canModerate = canModerateMedia(caller, principal, event)
        val mediaByResponse = if (responses.isEmpty()) {
            emptyMap()
        } else {
            momentMediaRepository.findByResponseIdIn(responses.map { it.id })
                .sortedBy { it.createdAt }
                .groupBy { it.response?.id }
        }
        val responseDtos = responses.map { response ->
            val media = mediaByResponse[response.id].orEmpty().map { toMediaDto(it, event.id, caller, canModerate) }
            toResponseDto(response, labels, media)
        }
        val mapGeoJson = buildGeoJson(session, responses)

        return MomentDetailDto(
            session = toSessionDto(session, responses.size, labels),
            responses = responseDtos,
            mapGeoJson = mapGeoJson
        )
    }

    /**
     * Liefert die GeoJSON FeatureCollection aller freigegebenen Teilnehmer-Standorte.
     */
    @Transactional(readOnly = true)
    fun getMomentMapGeoJson(eventId: UUID, momentId: UUID, principal: UserPrincipal): MomentMapGeoJsonDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)

        val session = requireMomentSession(momentId)
        if (session.event?.id != event.id) {
            throw ResourceNotFoundException(Msg("error.moment.wrongEvent", momentId, eventId), ErrorCode.NOT_FOUND)
        }

        val responses = momentResponseRepository.findByMomentIdOrderByCreatedAtAsc(session.id)
        return buildGeoJson(session, responses)
    }

    /**
     * Schließt einen Moment vorzeitig oder regulär ab und erzeugt die Zusammenfassung für die Event-Historie.
     */
    fun completeMoment(eventId: UUID, momentId: UUID, principal: UserPrincipal): MomentSummaryDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)

        val session = requireMomentSession(momentId)
        if (session.event?.id != event.id) {
            throw ResourceNotFoundException(Msg("error.moment.wrongEvent", momentId, eventId), ErrorCode.NOT_FOUND)
        }

        if (!canManageMoment(caller, principal, event, session)) {
            throw AccessDeniedException(
                Msg("error.moment.closeDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }

        return completeMomentInternal(session)
    }

    /**
     * Listet alle vergangenen / archivierten Momente eines Events für die Kalender- und Event-Historie auf.
     */
    @Transactional
    fun listMomentHistory(eventId: UUID, principal: UserPrincipal): List<MomentSummaryDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireMemberAccess(caller, principal, event)

        val sessions = momentSessionRepository.findByEventIdOrderByCreatedAtDesc(event.id)
        val now = Instant.now()
        sessions.forEach { s ->
            if (s.active && s.expiresAt.isBefore(now)) {
                completeMomentInternal(s)
            }
        }

        // Nur abgeschlossene Momente gehören in die Historie; laufende zeigt die Event-Seite separat.
        val labels = momentConfigService.labels()
        return sessions.filterNot { it.active }.map { toSummaryDto(it, labels) }
    }

    private fun completeMomentInternal(session: MomentSessionEntity): MomentSummaryDto {
        if (session.active) {
            val responses = momentResponseRepository.findByMomentIdOrderByCreatedAtAsc(session.id)
            val participantIds = responses.mapNotNull { it.user?.id }.toSet()
            val uniqueParticipants = (participantIds + listOfNotNull(session.creator?.id)).distinct().size
            val totalResponses = responses.size
            val typeName = momentConfigService.labels().typeName(session.topicType)
            val summaryText = "$uniqueParticipants Teilnehmer haben $totalResponses Statusbeiträge zum Moment '${session.title}' ($typeName) geteilt."

            session.active = false
            session.completedAt = Instant.now()
            session.summary = summaryText
            momentSessionRepository.save(session)

            auditService.recordMomentAction(
                actor = session.creator,
                action = AuditService.ACTION_MOMENT_COMPLETED,
                momentId = session.id,
                details = summaryText
            )
        }
        return toSummaryDto(session, momentConfigService.labels())
    }

    private fun buildGeoJson(session: MomentSessionEntity, responses: List<MomentResponseEntity>): MomentMapGeoJsonDto {
        val features = mutableListOf<GeoJsonFeatureDto>()

        if (session.latitude != null && session.longitude != null) {
            features.add(
                GeoJsonFeatureDto(
                    geometry = GeoJsonGeometryDto(
                        type = "Point",
                        coordinates = listOf(session.longitude!!, session.latitude!!)
                    ),
                    properties = mapOf(
                        "id" to session.id.toString(),
                        "type" to "session_initiator",
                        "userId" to session.creator?.id?.toString(),
                        "userName" to session.creator?.displayName,
                        "title" to session.title,
                        "topicType" to session.topicType,
                        "message" to session.message,
                        "createdAt" to session.createdAt.toString()
                    )
                )
            )
        }

        responses.filter { it.latitude != null && it.longitude != null }.forEach { resp ->
            features.add(
                GeoJsonFeatureDto(
                    geometry = GeoJsonGeometryDto(
                        type = "Point",
                        coordinates = listOf(resp.longitude!!, resp.latitude!!)
                    ),
                    properties = mapOf(
                        "id" to resp.id.toString(),
                        "type" to "response",
                        "userId" to resp.user?.id?.toString(),
                        "userName" to resp.user?.displayName,
                        "reaction" to resp.reaction,
                        "statusText" to resp.statusText,
                        "createdAt" to resp.createdAt.toString()
                    )
                )
            )
        }

        return MomentMapGeoJsonDto(
            type = "FeatureCollection",
            features = features
        )
    }

    private fun validateCoordinatesAndConsent(lat: Double?, lon: Double?, consent: Boolean) {
        if ((lat != null && lon == null) || (lat == null && lon != null)) {
            throw InvalidRequestException(Msg("error.moment.coordinatesIncomplete"), ErrorCode.INVALID_REQUEST)
        }
        if (lat != null && (lat < -90.0 || lat > 90.0)) {
            throw InvalidRequestException(Msg("error.moment.latitudeRange"), ErrorCode.INVALID_REQUEST)
        }
        if (lon != null && (lon < -180.0 || lon > 180.0)) {
            throw InvalidRequestException(Msg("error.moment.longitudeRange"), ErrorCode.INVALID_REQUEST)
        }
        if ((lat != null || lon != null) && !consent) {
            throw ConsentRequiredException(Msg("error.moment.consentRequired"), ErrorCode.CONSENT_REQUIRED)
        }
    }

    private fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.event.notFound", id), ErrorCode.NOT_FOUND)
        }

    private fun requireMomentSession(id: UUID): MomentSessionEntity =
        momentSessionRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.moment.notFound", id), ErrorCode.NOT_FOUND)
        }

    private fun requireEventOpen(event: EventEntity) {
        if (event.status == EventStatus.cancelled || event.status == EventStatus.archived) {
            throw EventNotActiveException(Msg("error.event.notActive"), ErrorCode.EVENT_NOT_ACTIVE)
        }
    }

    private fun requireMemberAccess(caller: UserEntity, principal: UserPrincipal, event: EventEntity) {
        if (!canViewEvent(caller, principal, event)) {
            throw AccessDeniedException(Msg("error.event.accessDenied"), ErrorCode.ACCESS_DENIED)
        }
    }

    private fun canViewEvent(caller: UserEntity, principal: UserPrincipal, event: EventEntity): Boolean {
        if (isBoardOrAdmin(caller, principal)) return true
        if (event.owner?.id == caller.id) return true
        return eventParticipantRepository.findByEventIdAndUserId(event.id, caller.id).isPresent
    }

    private fun canManageMoment(caller: UserEntity, principal: UserPrincipal, event: EventEntity, session: MomentSessionEntity): Boolean {
        if (isBoardOrAdmin(caller, principal)) return true
        if (event.owner?.id == caller.id) return true
        return session.creator?.id == caller.id
    }

    /** Bilder/Videos anderer entfernen dürfen Event-Owner sowie Vorstand/Admin. */
    private fun canModerateMedia(caller: UserEntity, principal: UserPrincipal, event: EventEntity): Boolean =
        isBoardOrAdmin(caller, principal) || event.owner?.id == caller.id

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean {
        val dbRoles = userRoleRepository.findByIdUserId(caller.id).map { it.id.role.name }
        val roles = principal.roles + dbRoles
        return roles.any { it == UserRole.BOARD || it == UserRole.ADMIN }
    }

    private fun toSessionDto(session: MomentSessionEntity, responsesCount: Int, labels: MomentLabels): MomentSessionDto {
        return MomentSessionDto(
            id = session.id.toString(),
            eventId = session.event?.id?.toString().orEmpty(),
            creatorId = session.creator?.id?.toString().orEmpty(),
            creatorName = session.creator?.displayName.orEmpty(),
            conversationId = session.conversation?.id?.toString(),
            title = session.title,
            topicType = session.topicType,
            message = session.message,
            latitude = session.latitude,
            longitude = session.longitude,
            active = session.active,
            topicName = labels.typeName(session.topicType),
            topicEmoji = labels.typeEmoji(session.topicType),
            responsesCount = responsesCount,
            expiresAt = session.expiresAt,
            createdAt = session.createdAt,
            summary = session.summary
        )
    }

    private fun toResponseDto(
        response: MomentResponseEntity,
        labels: MomentLabels,
        media: List<MomentMediaDto>
    ): MomentResponseDto {
        return MomentResponseDto(
            id = response.id.toString(),
            momentId = response.moment?.id?.toString().orEmpty(),
            userId = response.user?.id?.toString().orEmpty(),
            userName = response.user?.displayName.orEmpty(),
            reaction = response.reaction,
            statusText = response.statusText,
            latitude = response.latitude,
            longitude = response.longitude,
            createdAt = response.createdAt,
            reactionName = labels.reactionName(response.reaction),
            reactionEmoji = labels.reactionEmoji(response.reaction),
            media = media
        )
    }

    private fun toSummaryDto(session: MomentSessionEntity, labels: MomentLabels): MomentSummaryDto {
        val responses = momentResponseRepository.findByMomentId(session.id)
        val participantIds = responses.mapNotNull { it.user?.id }.toSet()
        val uniqueCount = (participantIds + listOfNotNull(session.creator?.id)).distinct().size
        return MomentSummaryDto(
            momentId = session.id.toString(),
            title = session.title,
            topicType = session.topicType,
            topicName = labels.typeName(session.topicType),
            topicEmoji = labels.typeEmoji(session.topicType),
            totalResponses = responses.size,
            uniqueParticipants = uniqueCount,
            summary = session.summary,
            // Ältere Datensätze ohne Abschlusszeit fallen auf das Ablaufdatum zurück.
            completedAt = session.completedAt ?: session.expiresAt
        )
    }

    companion object {
        const val NOTIFICATION_TYPE_MOMENT = "moment"

        fun toMediaDto(media: MomentMediaEntity, eventId: UUID, caller: UserEntity, canModerate: Boolean) = MomentMediaDto(
            id = media.id.toString(),
            kind = media.kind.name,
            contentType = media.contentType,
            sizeBytes = media.sizeBytes,
            width = media.width,
            height = media.height,
            durationSeconds = media.durationMs?.let { it / 1000.0 },
            url = "/api/v1/events/$eventId/moments/${media.moment?.id}/media/${media.id}/content",
            canDelete = canModerate || media.owner?.id == caller.id
        )
    }
}

/** Ergebnis der Zugriffsprüfung auf einen Moment. */
class MomentAccess(
    val caller: UserEntity,
    val event: EventEntity,
    val session: MomentSessionEntity,
    /** Event-Owner oder Vorstand/Admin: darf Bilder/Videos anderer entfernen. */
    val canModerate: Boolean
)
