package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventParticipantEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.RsvpStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.StammtischMembers
import org.springframework.stereotype.Service
import java.time.Instant
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
    private val members: StammtischMembers,
    private val access: StammtischAccess,
    private val userService: UserService,
    private val eventInvitationService: EventInvitationService
) {

    fun createEvent(request: CreateEventRequest, principal: UserPrincipal): EventDto {
        val caller = userService.getOrCreateUser(principal)
        if (!canCreateEvents(caller, principal)) {
            throw AccessDeniedException(
                Msg("error.event.createDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }

        val title = request.title?.trim().orEmpty()
        if (title.isBlank()) {
            throw InvalidRequestException(Msg("error.field.blank", "title"), ErrorCode.INVALID_REQUEST)
        }
        val startsAt = request.startsAt
            ?: throw InvalidRequestException(Msg("error.field.required", "startsAt"), ErrorCode.INVALID_REQUEST)
        if (request.endsAt != null && request.endsAt.isBefore(startsAt)) {
            throw InvalidRequestException(Msg("error.event.endsBeforeStart"), ErrorCode.INVALID_REQUEST)
        }

        val event = EventEntity(
            title = title,
            description = request.description?.trim()?.ifBlank { null },
            location = request.location?.trim()?.ifBlank { null },
            startsAt = startsAt,
            endsAt = request.endsAt,
            status = if (request.status == EventStatus.published.name) EventStatus.published else EventStatus.draft,
            owner = caller,
            invitationNotifyAt = request.invitationNotifyAt,
            reminderHoursBefore = request.reminderHoursBefore
        )
        val saved = eventRepository.save(event)
        invite(saved, request.inviteUserIds, request.inviteAllMembers == true)
        eventInvitationService.dispatchDue()
        return toEventDto(saved, caller, principal)
    }

    /** Lädt mehrere Mitglieder ein; bereits Eingeladene und der Owner werden übersprungen. */
    fun inviteMembers(eventId: UUID, request: InviteMembersRequest, principal: UserPrincipal): List<EventParticipantDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)
        invite(event, request.userIds, request.allMembers == true)
        eventInvitationService.dispatchDue()
        return eventParticipantRepository.findByEventId(eventId)
            .map { toParticipantDto(it) }
            .sortedBy { it.displayName }
    }

    /** Zu-, Ab- oder Vielleicht-Antwort des eingeladenen Mitglieds selbst. */
    fun respond(eventId: UUID, request: RsvpRequest, principal: UserPrincipal): EventDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        val participant = eventParticipantRepository.findByEventIdAndUserId(eventId, caller.id).orElseThrow {
            AccessDeniedException(Msg("error.event.rsvp.notInvited"), ErrorCode.ACCESS_DENIED)
        }
        if (event.status == EventStatus.cancelled || event.status == EventStatus.archived || event.status == EventStatus.completed) {
            throw InvalidRequestException(Msg("error.event.rsvp.closed"), ErrorCode.INVALID_REQUEST)
        }
        val status = RsvpStatus.fromValue(request.status)
            ?.takeIf { it != RsvpStatus.invited }
            ?: throw InvalidRequestException(Msg("validation.rsvp.allowed"), ErrorCode.INVALID_REQUEST)
        participant.rsvp = status
        participant.rsvpAt = Instant.now()
        eventParticipantRepository.save(participant)
        return toEventDto(event, caller, principal)
    }

    private fun invite(event: EventEntity, userIds: List<String>?, allMembers: Boolean) {
        val targets = if (allMembers) {
            members.activeUsers()
        } else {
            members.requireActiveUsers(userIds.orEmpty().map { parseParticipantId(it) })
        }
        val existing = eventParticipantRepository.findByEventId(event.id).mapNotNull { it.user?.id }.toSet()
        targets
            .filter { it.id != event.owner?.id && it.id !in existing }
            .forEach { eventParticipantRepository.save(EventParticipantEntity(event = event, user = it, role = PARTICIPANT_ROLE_DEFAULT)) }
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

        val myRsvp = eventParticipantRepository.findByUserId(caller.id)
            .associate { it.event?.id to it.rsvp.name }
        return visible
            .sortedByDescending { it.startsAt }
            .map { toSummaryDto(it, myRsvp[it.id]) }
    }

    @Transactional(readOnly = true)
    fun getEvent(id: UUID, principal: UserPrincipal): EventDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(id)
        if (!canViewEvent(caller, principal, event)) {
            throw AccessDeniedException(
                Msg("error.event.viewDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
        return toEventDto(event, caller, principal)
    }

    fun updateEvent(id: UUID, request: UpdateEventRequest, principal: UserPrincipal): EventDto {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(id)
        requireManage(caller, principal, event)

        if (request.title != null) {
            val title = request.title.trim()
            if (title.isBlank()) {
                throw InvalidRequestException(Msg("error.field.blank", "title"), ErrorCode.INVALID_REQUEST)
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
            throw InvalidRequestException(Msg("error.event.endsBeforeStart"), ErrorCode.INVALID_REQUEST)
        }
        if (request.inviteOnPublish == true) {
            event.invitationNotifyAt = null
        } else if (request.invitationNotifyAt != null) {
            event.invitationNotifyAt = request.invitationNotifyAt
        }
        if (request.reminderHoursBefore != null) {
            event.reminderHoursBefore = request.reminderHoursBefore.takeIf { it > 0 }
        }
        val previousStatus = event.status
        if (request.status != null) {
            event.status = EventStatus.fromValue(request.status)
                ?: throw InvalidRequestException(Msg("error.event.invalidStatus", request.status), ErrorCode.INVALID_REQUEST)
        }

        val saved = eventRepository.save(event)
        if (previousStatus != EventStatus.cancelled && saved.status == EventStatus.cancelled) {
            eventInvitationService.notifyCancelled(saved)
        }
        eventInvitationService.dispatchDue()
        return toEventDto(saved, caller, principal)
    }

    @Transactional(readOnly = true)
    fun listParticipants(eventId: UUID, principal: UserPrincipal): List<EventParticipantDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        if (!canViewEvent(caller, principal, event)) {
            throw AccessDeniedException(
                Msg("error.event.participants.viewDenied"),
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
        val targetUser = members.requireActiveUser(targetId)

        if (event.owner?.id == targetUser.id) {
            throw InvalidRequestException(
                Msg("error.event.participant.isOwner"),
                ErrorCode.INVALID_REQUEST
            )
        }

        if (eventParticipantRepository.findByEventIdAndUserId(eventId, targetUser.id).isPresent) {
            throw InvalidRequestException(
                Msg("error.event.participant.alreadyAdded"),
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
        eventInvitationService.dispatchDue()
        return toParticipantDto(saved)
    }

    fun removeParticipant(eventId: UUID, userId: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        val participant = eventParticipantRepository.findByEventIdAndUserId(eventId, userId).orElseThrow {
            ResourceNotFoundException(
                Msg("error.event.participant.notAssigned", userId),
                ErrorCode.NOT_FOUND
            )
        }
        eventParticipantRepository.delete(participant)
    }

    private fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.event.notFound", id), ErrorCode.NOT_FOUND)
        }

    /** Owner-Rechte gelten ausschließlich für eigene Events; Vorstand/Admin moderieren fremde Events. */
    private fun requireManage(caller: UserEntity, principal: UserPrincipal, event: EventEntity) {
        if (!canManageEvent(caller, principal, event)) {
            throw AccessDeniedException(
                Msg("error.event.manageDenied"),
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
        access.has(principal, caller, Permission.EVENT_CREATE)

    /** Vorstand und andere Rollen mit `event.manage` sehen und moderieren alle Events des Stammtischs. */
    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        access.has(principal, caller, Permission.EVENT_MANAGE)

    private fun parseParticipantId(value: String?): UUID {
        val trimmed = value?.trim()
        if (trimmed.isNullOrEmpty()) {
            throw InvalidRequestException(Msg("error.field.blank", "userId"), ErrorCode.INVALID_REQUEST)
        }
        return try {
            UUID.fromString(trimmed)
        } catch (_: IllegalArgumentException) {
            throw InvalidRequestException(Msg("error.field.invalidUuid", "userId", trimmed), ErrorCode.INVALID_REQUEST)
        }
    }

    private fun toEventDto(event: EventEntity, caller: UserEntity, principal: UserPrincipal): EventDto {
        val owner = event.owner
        val participants = eventParticipantRepository.findByEventId(event.id)
        val counts = participants.groupingBy { it.rsvp }.eachCount()
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
            participantCount = participants.size,
            createdAt = event.createdAt,
            updatedAt = event.updatedAt,
            invitationNotifyAt = event.invitationNotifyAt,
            reminderHoursBefore = event.reminderHoursBefore,
            myRsvp = participants.firstOrNull { it.user?.id == caller.id }?.rsvp?.name,
            rsvpCounts = RsvpCountsDto(
                invited = counts[RsvpStatus.invited] ?: 0,
                accepted = counts[RsvpStatus.accepted] ?: 0,
                maybe = counts[RsvpStatus.maybe] ?: 0,
                declined = counts[RsvpStatus.declined] ?: 0
            ),
            canManage = canManageEvent(caller, principal, event)
        )
    }

    private fun toSummaryDto(event: EventEntity, myRsvp: String?): EventSummaryDto {
        val owner = event.owner
        return EventSummaryDto(
            id = event.id.toString(),
            title = event.title,
            status = event.status.name,
            startsAt = event.startsAt,
            endsAt = event.endsAt,
            ownerId = owner?.id?.toString().orEmpty(),
            ownerDisplayName = owner?.displayName.orEmpty(),
            location = event.location,
            myRsvp = myRsvp
        )
    }

    private fun toParticipantDto(participant: EventParticipantEntity): EventParticipantDto {
        val user = participant.user
        return EventParticipantDto(
            userId = user?.id?.toString().orEmpty(),
            displayName = user?.displayName.orEmpty(),
            role = participant.role,
            joinedAt = participant.joinedAt,
            rsvp = participant.rsvp.name,
            rsvpAt = participant.rsvpAt
        )
    }

    companion object {
        const val PARTICIPANT_ROLE_DEFAULT = "participant"
    }
}
