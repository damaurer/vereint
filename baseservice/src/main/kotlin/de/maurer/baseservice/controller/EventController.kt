package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.EventSeriesService
import de.maurer.baseservice.service.EventService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/v1/events")
@Tag(name = "Events", description = "Events, Event-Owner und Teilnehmerverwaltung")
class EventController(
    private val eventService: EventService,
    private val eventSeriesService: EventSeriesService,
    private val authContext: AuthContext
) {

    /**
     * Die API-Verträge liefern Kennungen als Zeichenkette; intern wird der
     * native UUID-Typ verwendet. Ungültige Eingaben werden hier in `400`
     * überführt und erreichen die Fachlogik nicht.
     */
    private fun eventId(id: String) = Identifiers.parseUuid(id, "eventId")

    private fun userId(id: String) = Identifiers.parseUuid(id, "userId")

    @PostMapping
    @Operation(summary = "Event anlegen", description = "Legt ein neues Event mit dem aktuellen Benutzer als Owner an")
    fun createEvent(@Valid @RequestBody request: CreateEventRequest): ResponseEntity<EventDto> {
        val principal = authContext.getRequiredPrincipal()
        val event = if (request.recurrence != null) {
            eventSeriesService.create(request, principal)
        } else {
            eventService.createEvent(request, principal)
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(event)
    }

    @PostMapping("/recurrence-preview")
    @Operation(summary = "Wiederholung vorschauen", description = "Berechnet die nächsten Termine einer Wiederholung (Zeitzone Europe/Berlin)")
    fun previewRecurrence(@Valid @RequestBody request: RecurrencePreviewRequest): ResponseEntity<RecurrencePreviewDto> {
        authContext.getRequiredPrincipal()
        return ResponseEntity.ok(eventSeriesService.preview(request))
    }

    @PostMapping("/{id}/series/copy-menu")
    @Operation(summary = "Getränke und Speisen übernehmen", description = "Übernimmt Getränke und Speisen dieses Termins in alle folgenden Termine der Serie")
    fun copyMenuToFollowing(@PathVariable id: String): ResponseEntity<Map<String, Int>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(mapOf("updated" to eventSeriesService.copyMenuToFollowing(eventId(id), principal)))
    }

    @GetMapping
    @Operation(summary = "Events auflisten", description = "Listet die für den aktuellen Benutzer sichtbaren Events")
    fun listEvents(): ResponseEntity<List<EventSummaryDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(eventService.listEvents(principal))
    }

    @GetMapping("/{id}")
    @Operation(summary = "Event abrufen", description = "Liefert die Eventdetails für Owner, Teilnehmer, Vorstand oder Administration")
    fun getEvent(@PathVariable id: String): ResponseEntity<EventDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(eventService.getEvent(eventId(id), principal))
    }

    @PutMapping("/{id}")
    @Operation(summary = "Event aktualisieren", description = "Aktualisiert Stammdaten und Status des eigenen Events (Owner) bzw. moderierend (Vorstand/Admin)")
    fun updateEvent(
        @PathVariable id: String,
        @Valid @RequestBody request: UpdateEventRequest
    ): ResponseEntity<EventDto> {
        val principal = authContext.getRequiredPrincipal()
        val scope = request.scope ?: EventSeriesService.SCOPE_THIS
        if (scope == EventSeriesService.SCOPE_THIS && request.recurrence != null) {
            throw InvalidRequestException(Msg("error.event.series.recurrenceNeedsScope"), ErrorCode.INVALID_REQUEST)
        }
        val updated = if (scope == EventSeriesService.SCOPE_THIS) {
            eventService.updateEvent(eventId(id), request, principal)
        } else {
            eventSeriesService.update(eventId(id), request, principal)
        }
        return ResponseEntity.ok(updated)
    }

    @GetMapping("/{id}/participants")
    @Operation(summary = "Teilnehmer auflisten", description = "Listet die Teilnehmer eines Events für berechtigte Benutzer")
    fun listParticipants(@PathVariable id: String): ResponseEntity<List<EventParticipantDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(eventService.listParticipants(eventId(id), principal))
    }

    @PostMapping("/{id}/participants")
    @Operation(summary = "Teilnehmer hinzufügen", description = "Fügt einen Teilnehmer hinzu (nur Owner sowie Vorstand/Admin)")
    fun addParticipant(
        @PathVariable id: String,
        @Valid @RequestBody request: AddParticipantRequest
    ): ResponseEntity<EventParticipantDto> {
        val principal = authContext.getRequiredPrincipal()
        val participant = eventService.addParticipant(eventId(id), request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(participant)
    }

    @PostMapping("/{id}/invitations")
    @Operation(summary = "Mitglieder einladen", description = "Lädt ausgewählte oder alle aktiven Mitglieder ein (Owner sowie Vorstand/Admin)")
    fun inviteMembers(
        @PathVariable id: String,
        @Valid @RequestBody request: InviteMembersRequest
    ): ResponseEntity<List<EventParticipantDto>> {
        val principal = authContext.getRequiredPrincipal()
        if (request.scope == EventSeriesService.SCOPE_FOLLOWING) {
            eventSeriesService.inviteFollowing(eventId(id), request, principal)
            return ResponseEntity.ok(eventService.listParticipants(eventId(id), principal))
        }
        return ResponseEntity.ok(eventService.inviteMembers(eventId(id), request, principal))
    }

    @PutMapping("/{id}/rsvp")
    @Operation(summary = "Zu- oder absagen", description = "Antwort des eingeladenen Mitglieds: accepted, maybe oder declined")
    fun respond(
        @PathVariable id: String,
        @Valid @RequestBody request: RsvpRequest
    ): ResponseEntity<EventDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(eventService.respond(eventId(id), request, principal))
    }

    @DeleteMapping("/{id}/participants/{userId}")
    @Operation(summary = "Teilnehmer entfernen", description = "Entfernt einen Teilnehmer (nur Owner sowie Vorstand/Admin)")
    fun removeParticipant(
        @PathVariable id: String,
        @PathVariable("userId") participantId: String
    ): ResponseEntity<Void> {
        val principal = authContext.getRequiredPrincipal()
        eventService.removeParticipant(eventId(id), userId(participantId), principal)
        return ResponseEntity.noContent().build()
    }
}
