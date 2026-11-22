package de.maurer.baseservice.dto

import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.time.Instant
import java.time.LocalDate

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

    val inviteAllMembers: Boolean? = null,

    /** „Statistik für dieses Event“; Standard an. */
    val statisticsEnabled: Boolean? = null,

    /** Wiederholung; gesetzt heißt: Serie anlegen, `startsAt` ist der erste mögliche Termin. */
    @field:Valid
    val recurrence: RecurrenceRequest? = null
)

/**
 * Wiederholung eines Events, angelehnt an RFC 5545 (`RRULE`).
 *
 * - `frequency`: `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` oder `NONE` (keine
 *   Regel, nur der Beginn und `extraDates`, also unregelmäßige Termine).
 * - `weekdays` (`MO` … `SU`) mit `positions` (`1` … `5`, `-1` = letzter): z. B.
 *   `positions=[-1]`, `weekdays=[SA]` = letzter Samstag im Monat. Ohne
 *   Positionen heißt es bei `MONTHLY` „jeden dieser Wochentage“.
 * - `monthDays` (`1` … `31`, `-1` = letzter Tag) und `months` (`1` … `12`).
 * - Ende: `count` Termine oder bis `until` (einschließlich); beides leer = nie.
 * - `inviteLeadDays`: Einladung so viele Tage vor jedem Termin.
 */
data class RecurrenceRequest(
    @field:Pattern(regexp = "^(DAILY|WEEKLY|MONTHLY|YEARLY|NONE)$", message = "frequency {validation.recurrence.frequency}")
    val frequency: String? = null,

    @field:Min(value = 1, message = "interval {validation.min}")
    @field:Max(value = 99, message = "interval {validation.max}")
    val interval: Int? = null,

    @field:Size(max = 7, message = "weekdays {validation.size.max}")
    val weekdays: List<String>? = null,

    @field:Size(max = 6, message = "positions {validation.size.max}")
    val positions: List<Int>? = null,

    @field:Size(max = 31, message = "monthDays {validation.size.max}")
    val monthDays: List<Int>? = null,

    @field:Size(max = 12, message = "months {validation.size.max}")
    val months: List<Int>? = null,

    @field:Min(value = 1, message = "count {validation.min}")
    @field:Max(value = 500, message = "count {validation.max}")
    val count: Int? = null,

    val until: LocalDate? = null,

    @field:Size(max = 200, message = "extraDates {validation.size.max}")
    val extraDates: List<LocalDate>? = null,

    @field:Size(max = 200, message = "excludedDates {validation.size.max}")
    val excludedDates: List<LocalDate>? = null,

    @field:Min(value = 0, message = "inviteLeadDays {validation.min}")
    @field:Max(value = 365, message = "inviteLeadDays {validation.max}")
    val inviteLeadDays: Int? = null
)

/** Vorschau der nächsten Termine einer Wiederholung (`POST /events/recurrence-preview`). */
data class RecurrencePreviewRequest(
    @field:NotNull(message = "startsAt {validation.required}")
    val startsAt: Instant? = null,

    @field:NotNull(message = "recurrence {validation.required}")
    @field:Valid
    val recurrence: RecurrenceRequest? = null,

    @field:Min(value = 1, message = "limit {validation.min}")
    @field:Max(value = 50, message = "limit {validation.max}")
    val limit: Int? = null
)

data class RecurrencePreviewDto(
    val dates: List<Instant>,
    /** Weitere Termine folgen nach den gezeigten. */
    val more: Boolean,
    val rrule: String?
)

/** Serie eines Termins in den Eventdetails. */
data class EventSeriesDto(
    val id: String,
    val rrule: String?,
    val frequency: String,
    val interval: Int,
    val weekdays: List<String>,
    val positions: List<Int>,
    val monthDays: List<Int>,
    val months: List<Int>,
    val count: Int?,
    val until: LocalDate?,
    val extraDates: List<LocalDate>,
    val excludedDates: List<LocalDate>,
    val inviteLeadDays: Int?,
    val startsOn: LocalDate,
    val timeZone: String,
    /** Ursprünglicher Tag dieses Termins. */
    val occurrenceDate: LocalDate?,
    /** Dieser Termin wurde einzeln geändert. */
    val detached: Boolean,
    val inviteAllMembers: Boolean,
    /** Nächste Termine der Serie (bereits angelegt). */
    val upcoming: List<EventOccurrenceDto> = emptyList()
)

data class EventOccurrenceDto(
    val eventId: String,
    val startsAt: Instant,
    val status: String
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
    val reminderHoursBefore: Int? = null,

    /** „Statistik für dieses Event“ ein- oder ausschalten. */
    val statisticsEnabled: Boolean? = null,

    /**
     * Bei Terminen einer Serie: `this` (Standard, nur dieser Termin),
     * `following` (dieser und alle folgenden) oder `all` (alle kommenden
     * Termine der Serie). Bei einem einzelnen Event macht `following` mit
     * [recurrence] daraus eine Serie.
     */
    @field:Pattern(regexp = "^(this|following|all)?$", message = "scope {validation.event.scope.allowed}")
    val scope: String? = null,

    /** Neue Wiederholung; nur mit `scope` `following` oder `all`. */
    @field:Valid
    val recurrence: RecurrenceRequest? = null
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
    val canManage: Boolean = false,
    /** „Statistik für dieses Event“. */
    val statisticsEnabled: Boolean = true,
    /** Serie, falls das Event ein Termin einer Wiederholung ist. */
    val series: EventSeriesDto? = null
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
    val allMembers: Boolean? = null,
    /** Bei Serien: `following` lädt auch zu allen folgenden und künftigen Terminen ein. */
    @field:Pattern(regexp = "^(this|following)?$", message = "scope {validation.event.scope.allowed}")
    val scope: String? = null
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
    val myRsvp: String? = null,
    /** Serie, falls das Event ein Termin einer Wiederholung ist. */
    val seriesId: String? = null
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
