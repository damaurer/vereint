package de.maurer.baseservice.dto

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

    val endsAt: Instant? = null
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
    val status: String? = null
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
    val updatedAt: Instant
)

data class EventSummaryDto(
    val id: String,
    val title: String,
    val status: String,
    val startsAt: Instant,
    val endsAt: Instant?,
    val ownerId: String,
    val ownerDisplayName: String
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
    val joinedAt: Instant
)
