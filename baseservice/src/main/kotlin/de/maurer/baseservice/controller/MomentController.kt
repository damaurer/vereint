package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.MomentService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * REST-Schnittstelle für Gemeinschaftsmomente & Rituale (TICKET-021 / Moments).
 *
 * Ermöglicht das Starten von Momenten (Anstoßen, Gebet, Jubel, Check-in), das Absenden
 * von (mehrfachen) Status- und Stimmungs-Rückmeldungen, die Einsicht in Live-Timeline und
 * GeoJSON-Weltkarte sowie die Archivierung in die Event-Historie.
 */
@RestController
@RequestMapping("/api/v1/events/{eventId}/moments")
@Tag(name = "Moments", description = "Gemeinschaftsmomente & Rituale (Moments)")
class MomentController(
    private val momentService: MomentService,
    private val authContext: AuthContext
) {

    private fun eventId(id: String) = Identifiers.parseUuid(id, "eventId")
    private fun momentId(id: String) = Identifiers.parseUuid(id, "momentId")

    @PostMapping
    @Operation(summary = "Moment starten", description = "Startet einen neuen Gemeinschaftsmoment im Kontext eines Events")
    fun startMoment(
        @PathVariable("eventId") eventIdValue: String,
        @Valid @RequestBody request: StartMomentRequest
    ): ResponseEntity<MomentSessionDto> {
        val principal = authContext.getRequiredPrincipal()
        val session = momentService.startMoment(eventId(eventIdValue), request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(session)
    }

    @GetMapping
    @Operation(summary = "Aktive Momente auflisten", description = "Listet alle aktiven Momente eines Events für berechtigte Mitglieder")
    fun listActiveMoments(
        @PathVariable("eventId") eventIdValue: String
    ): ResponseEntity<List<MomentSessionDto>> {
        val principal = authContext.getRequiredPrincipal()
        val moments = momentService.listActiveMoments(eventId(eventIdValue), principal)
        return ResponseEntity.ok(moments)
    }

    @GetMapping("/{momentId}")
    @Operation(summary = "Moment-Details abrufen", description = "Liefert die Detailansicht eines Moments inklusive Timeline aller Statusbeiträge und GeoJSON")
    fun getMomentDetail(
        @PathVariable("eventId") eventIdValue: String,
        @PathVariable("momentId") momentIdValue: String
    ): ResponseEntity<MomentDetailDto> {
        val principal = authContext.getRequiredPrincipal()
        val detail = momentService.getMomentDetail(eventId(eventIdValue), momentId(momentIdValue), principal)
        return ResponseEntity.ok(detail)
    }

    @PostMapping("/{momentId}/responses")
    @Operation(summary = "Reaktion / Status absenden", description = "Sendet ein Status-Update bzw. eine Reaktion zu einem aktiven Moment ab")
    fun submitResponse(
        @PathVariable("eventId") eventIdValue: String,
        @PathVariable("momentId") momentIdValue: String,
        @Valid @RequestBody request: SubmitMomentResponseRequest
    ): ResponseEntity<MomentResponseDto> {
        val principal = authContext.getRequiredPrincipal()
        val response = momentService.submitResponse(eventId(eventIdValue), momentId(momentIdValue), request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(response)
    }

    @GetMapping("/{momentId}/map")
    @Operation(summary = "GeoJSON-Kartenansicht", description = "Liefert eine RFC 7946 GeoJSON FeatureCollection aller freigegebenen Teilnehmer-Pins")
    fun getMomentMap(
        @PathVariable("eventId") eventIdValue: String,
        @PathVariable("momentId") momentIdValue: String
    ): ResponseEntity<MomentMapGeoJsonDto> {
        val principal = authContext.getRequiredPrincipal()
        val geoJson = momentService.getMomentMapGeoJson(eventId(eventIdValue), momentId(momentIdValue), principal)
        return ResponseEntity.ok(geoJson)
    }

    @PostMapping("/{momentId}/complete")
    @Operation(summary = "Moment abschließen", description = "Beendet einen Moment manuell und archiviert die Zusammenfassung für die Event-Historie")
    fun completeMoment(
        @PathVariable("eventId") eventIdValue: String,
        @PathVariable("momentId") momentIdValue: String
    ): ResponseEntity<MomentSummaryDto> {
        val principal = authContext.getRequiredPrincipal()
        val summary = momentService.completeMoment(eventId(eventIdValue), momentId(momentIdValue), principal)
        return ResponseEntity.ok(summary)
    }

    @GetMapping("/history")
    @Operation(summary = "Moment-Historie auflisten", description = "Listet alle abgeschlossenen und historischen Momente eines Events")
    fun listMomentHistory(
        @PathVariable("eventId") eventIdValue: String
    ): ResponseEntity<List<MomentSummaryDto>> {
        val principal = authContext.getRequiredPrincipal()
        val history = momentService.listMomentHistory(eventId(eventIdValue), principal)
        return ResponseEntity.ok(history)
    }
}
