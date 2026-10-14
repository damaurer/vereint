package de.maurer.baseservice.dto

import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.time.Instant

/** Zulässige Eventstatuswerte gemäß Datenvertrag (`EventStatus`). */
private const val EVENT_STATUS_PATTERN = "^(draft|published|active|cancelled|completed|archived)$"

/** Zulässige Teilnehmerrollen innerhalb eines Events. */
private const val PARTICIPANT_ROLE_PATTERN = "^(participant|coHost)?$"

data class CreateEventRequest(
    @field:NotBlank(message = "title {validation.notBlank}")
    @field:Size(max = 255, message = "title {validation.size.max}")
    val title: String? = null,

    @field:Size(max = 4000, message = "description {validation.size.max}")
    val description: String? = null,

    @field:Size(max = 255, message = "location {validation.size.max}")
    val location: String? = null,

    @field:NotNull(message = "startsAt {validation.required}")
    val startsAt: Instant? = null,

    val endsAt: Instant? = null,

    /** `draft` (Standard) oder `published`; veröffentlichte Events laden sofort bzw. zum Zeitpunkt ein. */
    @field:Pattern(regexp = "^(draft|published)?$", message = "status {validation.event.status.allowed}")
    val status: String? = null,

    /** Ab wann Eingeladene benachrichtigt werden; leer heißt: bei Veröffentlichung. */
    val invitationNotifyAt: Instant? = null,

    @field:Min(value = 1, message = "reminderHoursBefore {validation.min}")
    @field:Max(value = 720, message = "reminderHoursBefore {validation.max}")
    val reminderHoursBefore: Int? = null,

    /** Einzuladende Mitglieder; mit `inviteAllMembers` alle aktiven Mitglieder. */
    val inviteUserIds: List<String>? = null,

    val inviteAllMembers: Boolean? = null
)

data class UpdateEventRequest(
    @field:Size(min = 1, max = 255, message = "title {validation.size.range}")
    val title: String? = null,

    @field:Size(max = 4000, message = "description {validation.size.max}")
    val description: String? = null,

    @field:Size(max = 255, message = "location {validation.size.max}")
    val location: String? = null,

    val startsAt: Instant? = null,

    val endsAt: Instant? = null,

    @field:Pattern(
        regexp = EVENT_STATUS_PATTERN,
        message = "status {validation.event.status.allowed}"
    )
    val status: String? = null,

    /** Neuer Einladungszeitpunkt; mit `inviteOnPublish = true` wieder „bei Veröffentlichung“. */
    val invitationNotifyAt: Instant? = null,

    val inviteOnPublish: Boolean? = null,

    /** Stunden vor Beginn für die Erinnerung; `0` schaltet die Erinnerung ab. */
    @field:Min(value = 0, message = "reminderHoursBefore {validation.min}")
    @field:Max(value = 720, message = "reminderHoursBefore {validation.max}")
    val reminderHoursBefore: Int? = null
)

data class EventDto(
    val id: String,
    val title: String,
    val description: String?,
    val location: String?,
    val startsAt: Instant,
    val endsAt: Instant?,
    val status: String,
    val ownerId: String,
    val ownerDisplayName: String,
    val participantCount: Int,
    val createdAt: Instant,
    val updatedAt: Instant,
    val invitationNotifyAt: Instant? = null,
    val reminderHoursBefore: Int? = null,
    /** Eigene Antwort des Aufrufers, falls eingeladen. */
    val myRsvp: String? = null,
    val rsvpCounts: RsvpCountsDto = RsvpCountsDto(),
    val canManage: Boolean = false
)

data class RsvpCountsDto(
    val invited: Int = 0,
    val accepted: Int = 0,
    val maybe: Int = 0,
    val declined: Int = 0
)

/** Antwort eines Eingeladenen: `accepted`, `maybe` oder `declined`. */
data class RsvpRequest(
    @field:NotBlank(message = "status {validation.notBlank}")
    @field:Pattern(regexp = "^(accepted|maybe|declined)$", message = "status {validation.rsvp.allowed}")
    val status: String? = null
)

/** Mehrere Mitglieder auf einmal einladen. */
data class InviteMembersRequest(
    val userIds: List<String>? = null,
    val allMembers: Boolean? = null
)

data class EventSummaryDto(
    val id: String,
    val title: String,
    val status: String,
    val startsAt: Instant,
    val endsAt: Instant?,
    val ownerId: String,
    val ownerDisplayName: String,
    val location: String? = null,
    val myRsvp: String? = null
)

data class AddParticipantRequest(
    @field:NotBlank(message = "userId {validation.notBlank}")
    val userId: String? = null,

    @field:Pattern(
        regexp = PARTICIPANT_ROLE_PATTERN,
        message = "role {validation.participant.role.allowed}"
    )
    val role: String? = null
)

data class EventParticipantDto(
    val userId: String,
    val displayName: String,
    val role: String,
    val joinedAt: Instant,
    val rsvp: String = "invited",
    val rsvpAt: Instant? = null
)
