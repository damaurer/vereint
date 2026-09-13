package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Fachlicher Slice für Events, Event-Owner und Teilnehmer (TICKET-010).
 *
 * Alle Owner- und Verwaltungsrechte werden objektbezogen und serverseitig
 * geprüft; jeder Aufruf folgt dem Prinzip `deny by default`. Ein Mitglied darf
 * ausschließlich eigene Events verwalten, während Vorstand und Administration
 * fremde Events moderieren dürfen (siehe `docs/fachkonzept.md`).
 */
@Service
@Transactional
class EventService(
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val userRepository: UserRepository,
    private val userRoleRepository: UserRoleRepository,
    private val userService: UserService
) {

    fun createEvent(request: CreateEventRequest, principal: UserPrincipal): EventDto {
        val caller = userService.getOrCreateUser(principal)
        if (!canCreateEvents(caller, principal)) {
            throw AccessDeniedException(
                "Keine Berechtigung zum Anlegen von Events",
                ErrorCode.ACCESS_DENIED
            )
        }

        val title = request.title?.trim().orEmpty()
        if (title.isBlank()) {
            throw InvalidRequestException("title darf nicht leer sein", ErrorCode.INVALID_REQUEST)
        }
        val startsAt = request.startsAt
            ?: throw InvalidRequestException("startsAt ist erforderlich", ErrorCode.INVALID_REQUEST)
        if (request.endsAt != null && request.endsAt.isBefore(startsAt)) {
            throw InvalidRequestException("endsAt darf nicht vor startsAt liegen", ErrorCode.INVALID_REQUEST)
        }

        val event = EventEntity(
            title = title,
            description = request.description?.trim()?.ifBlank { null },
            location = request.location?.trim()?.ifBlank { null },
            startsAt = startsAt,
            endsAt = request.endsAt,
            status = EventStatus.draft,
            owner = caller
        )
        val saved = eventRepository.save(event)
        return toEventDto(saved)
    }

    @Transactional(readOnly = true)
    fun listEvents(principal: UserPrincipal): List<EventSummaryDto> {
        val caller = userService.getOrCreateUser(principal)

        val visible: Collection<EventEntity> = if (isBoardOrAdmin(caller, principal)) {
            eventRepository.findAll()
        } else {
            val owned = eventRepository.findByOwnerId(caller.id)
            val participating = eventParticipantRepository.findByUserId(caller.id)
                .mapNotNull { it.event }
            (owned + participating).associateBy { it.id }.values
        }

        return visible
            .sortedByDescending { it.startsAt }
            .map { toSummaryDto(it) }
    }

    @Transactional(readOnly = true)
    fun getEvent(id: UUID, principal: UserPrincipal): EventDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(id)
        if (!canViewEvent(caller, principal, event)) {
            throw AccessDeniedException(
                "Keine Berechtigung zum Anzeigen dieses Events",
                ErrorCode.ACCESS_DENIED
            )
        }
        return toEventDto(event)
    }

    fun updateEvent(id: UUID, request: UpdateEventRequest, principal: UserPrincipal): EventDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(id)
        requireManage(caller, principal, event)

        if (request.title != null) {
            val title = request.title.trim()
            if (title.isBlank()) {
                throw InvalidRequestException("title darf nicht leer sein", ErrorCode.INVALID_REQUEST)
            }
            event.title = title
        }
        if (request.description != null) {
            event.description = request.description.trim().ifBlank { null }
        }
        if (request.location != null) {
            event.location = request.location.trim().ifBlank { null }
        }
        if (request.startsAt != null) {
            event.startsAt = request.startsAt
        }
        if (request.endsAt != null) {
            event.endsAt = request.endsAt
        }
        val effectiveEnd = event.endsAt
        if (effectiveEnd != null && effectiveEnd.isBefore(event.startsAt)) {
            throw InvalidRequestException("endsAt darf nicht vor startsAt liegen", ErrorCode.INVALID_REQUEST)
        }
        if (request.status != null) {
            event.status = EventStatus.fromValue(request.status)
                ?: throw InvalidRequestException("Ungültiger Eventstatus: '${request.status}'", ErrorCode.INVALID_REQUEST)
        }

        val saved = eventRepository.save(event)
        return toEventDto(saved)
    }

    @Transactional(readOnly = true)
    fun listParticipants(eventId: UUID, principal: UserPrincipal): List<EventParticipantDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        if (!canViewEvent(caller, principal, event)) {
            throw AccessDeniedException(
                "Keine Berechtigung zum Anzeigen der Teilnehmer",
                ErrorCode.ACCESS_DENIED
            )
        }
        return eventParticipantRepository.findByEventId(eventId)
            .map { toParticipantDto(it) }
            .sortedBy { it.displayName }
    }

    fun addParticipant(eventId: UUID, request: AddParticipantRequest, principal: UserPrincipal): EventParticipantDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        val targetId = parseParticipantId(request.userId)
        val targetUser = userRepository.findById(targetId).orElseThrow {
            ResourceNotFoundException("Benutzer mit ID '$targetId' nicht gefunden", ErrorCode.NOT_FOUND)
        }

        if (event.owner?.id == targetUser.id) {
            throw InvalidRequestException(
                "Der Event-Owner ist bereits Eigentümer und kein Teilnehmer",
                ErrorCode.INVALID_REQUEST
            )
        }

        if (eventParticipantRepository.findByEventIdAndUserId(eventId, targetUser.id).isPresent) {
            throw InvalidRequestException(
                "Benutzer ist bereits Teilnehmer dieses Events",
                ErrorCode.INVALID_REQUEST
            )
        }

        val role = request.role?.trim()?.ifBlank { null } ?: PARTICIPANT_ROLE_DEFAULT
        val participant = EventParticipantEntity(
            event = event,
            user = targetUser,
            role = role
        )
        val saved = eventParticipantRepository.save(participant)
        return toParticipantDto(saved)
    }

    fun removeParticipant(eventId: UUID, userId: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        val participant = eventParticipantRepository.findByEventIdAndUserId(eventId, userId).orElseThrow {
            ResourceNotFoundException(
                "Teilnehmer mit ID '$userId' ist diesem Event nicht zugeordnet",
                ErrorCode.NOT_FOUND
            )
        }
        eventParticipantRepository.delete(participant)
    }

    private fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Event mit ID '$id' nicht gefunden", ErrorCode.NOT_FOUND)
        }

    /** Owner-Rechte gelten ausschließlich für eigene Events; Vorstand/Admin moderieren fremde Events. */
    private fun requireManage(caller: UserEntity, principal: UserPrincipal, event: EventEntity) {
        if (!canManageEvent(caller, principal, event)) {
            throw AccessDeniedException(
                "Nur der Event-Owner sowie Vorstand und Administration dürfen dieses Event verwalten",
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    private fun canManageEvent(caller: UserEntity, principal: UserPrincipal, event: EventEntity): Boolean =
        isBoardOrAdmin(caller, principal) || event.owner?.id == caller.id

    private fun canViewEvent(caller: UserEntity, principal: UserPrincipal, event: EventEntity): Boolean {
        if (isBoardOrAdmin(caller, principal)) return true
        if (event.owner?.id == caller.id) return true
        return eventParticipantRepository.findByEventIdAndUserId(event.id, caller.id).isPresent
    }

    private fun canCreateEvents(caller: UserEntity, principal: UserPrincipal): Boolean =
        rolesOf(caller, principal).any { it == UserRole.MEMBER || it == UserRole.BOARD || it == UserRole.ADMIN }

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        rolesOf(caller, principal).any { it == UserRole.BOARD || it == UserRole.ADMIN }

    private fun rolesOf(caller: UserEntity, principal: UserPrincipal): Set<String> {
        val dbRoles = userRoleRepository.findByIdUserId(caller.id).map { it.id.role.name }
        return principal.roles + dbRoles
    }

    private fun parseParticipantId(value: String?): UUID {
        val trimmed = value?.trim()
        if (trimmed.isNullOrEmpty()) {
            throw InvalidRequestException("userId darf nicht leer sein", ErrorCode.INVALID_REQUEST)
        }
        return try {
            UUID.fromString(trimmed)
        } catch (_: IllegalArgumentException) {
            throw InvalidRequestException("Ungültige Kennung für 'userId': '$trimmed' ist keine UUID", ErrorCode.INVALID_REQUEST)
        }
    }

    private fun toEventDto(event: EventEntity): EventDto {
        val owner = event.owner
        return EventDto(
            id = event.id.toString(),
            title = event.title,
            description = event.description,
            location = event.location,
            startsAt = event.startsAt,
            endsAt = event.endsAt,
            status = event.status.name,
            ownerId = owner?.id?.toString().orEmpty(),
            ownerDisplayName = owner?.displayName.orEmpty(),
            participantCount = eventParticipantRepository.countByEventId(event.id).toInt(),
            createdAt = event.createdAt,
            updatedAt = event.updatedAt
        )
    }

    private fun toSummaryDto(event: EventEntity): EventSummaryDto {
        val owner = event.owner
        return EventSummaryDto(
            id = event.id.toString(),
            title = event.title,
            status = event.status.name,
            startsAt = event.startsAt,
            endsAt = event.endsAt,
            ownerId = owner?.id?.toString().orEmpty(),
            ownerDisplayName = owner?.displayName.orEmpty()
        )
    }

    private fun toParticipantDto(participant: EventParticipantEntity): EventParticipantDto {
        val user = participant.user
        return EventParticipantDto(
            userId = user?.id?.toString().orEmpty(),
            displayName = user?.displayName.orEmpty(),
            role = participant.role,
            joinedAt = participant.joinedAt
        )
    }

    companion object {
        const val PARTICIPANT_ROLE_DEFAULT = "participant"
    }
}
