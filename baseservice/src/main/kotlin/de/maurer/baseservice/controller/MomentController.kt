package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.MomentMediaService
import de.maurer.baseservice.service.MomentService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/**
 * REST-Schnittstelle für Gemeinschaftsmomente & Rituale (TICKET-021 / Moments).
 *
 * Moments gehören zur Gruppe; ein Event ist optional (`eventId` beim Start,
 * `?eventId=` filtert Listen auf ein Event).
 *
 * Ermöglicht das Starten von Momenten (Anstoßen, Gebet, Jubel, Check-in), das Absenden
 * von (mehrfachen) Status- und Stimmungs-Rückmeldungen, die Einsicht in Live-Timeline und
 * GeoJSON-Weltkarte sowie die Archivierung in die Event-Historie.
 */
@RestController
@RequestMapping("/api/v1/moments")
@Tag(name = "Moments", description = "Gemeinschaftsmomente & Rituale (Moments)")
class MomentController(
    private val momentService: MomentService,
    private val momentMediaService: MomentMediaService,
    private val authContext: AuthContext
) {

    private fun eventId(id: String) = Identifiers.parseUuid(id, "eventId")
    private fun momentId(id: String) = Identifiers.parseUuid(id, "momentId")
    private fun mediaId(id: String) = Identifiers.parseUuid(id, "mediaId")

    @PostMapping
    @Operation(summary = "Moment starten", description = "Startet einen neuen Gemeinschaftsmoment, optional verknüpft mit einem Event")
    fun startMoment(
        @Valid @RequestBody request: StartMomentRequest
    ): ResponseEntity<MomentSessionDto> {
        val principal = authContext.getRequiredPrincipal()
        val session = momentService.startMoment(request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(session)
    }

    @GetMapping
    @Operation(summary = "Aktive Momente auflisten", description = "Listet alle laufenden Momente, die das Mitglied sehen darf; optional nur die eines Events")
    fun listActiveMoments(
        @RequestParam("eventId", required = false) eventIdValue: String?
    ): ResponseEntity<List<MomentSessionDto>> {
        val principal = authContext.getRequiredPrincipal()
        val moments = momentService.listActiveMoments(principal, eventIdValue?.let { eventId(it) })
        return ResponseEntity.ok(moments)
    }

    @GetMapping("/{momentId}")
    @Operation(summary = "Moment-Details abrufen", description = "Liefert die Detailansicht eines Moments inklusive Timeline aller Statusbeiträge und GeoJSON")
    fun getMomentDetail(
        @PathVariable("momentId") momentIdValue: String
    ): ResponseEntity<MomentDetailDto> {
        val principal = authContext.getRequiredPrincipal()
        val detail = momentService.getMomentDetail(momentId(momentIdValue), principal)
        return ResponseEntity.ok(detail)
    }

    @PostMapping("/{momentId}/responses")
    @Operation(summary = "Reaktion / Status absenden", description = "Sendet ein Status-Update bzw. eine Reaktion zu einem aktiven Moment ab")
    fun submitResponse(
        @PathVariable("momentId") momentIdValue: String,
        @Valid @RequestBody request: SubmitMomentResponseRequest
    ): ResponseEntity<MomentResponseDto> {
        val principal = authContext.getRequiredPrincipal()
        val response = momentService.submitResponse(momentId(momentIdValue), request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(response)
    }

    @GetMapping("/{momentId}/map")
    @Operation(summary = "GeoJSON-Kartenansicht", description = "Liefert eine RFC 7946 GeoJSON FeatureCollection aller freigegebenen Teilnehmer-Pins")
    fun getMomentMap(
        @PathVariable("momentId") momentIdValue: String
    ): ResponseEntity<MomentMapGeoJsonDto> {
        val principal = authContext.getRequiredPrincipal()
        val geoJson = momentService.getMomentMapGeoJson(momentId(momentIdValue), principal)
        return ResponseEntity.ok(geoJson)
    }

    @PostMapping("/{momentId}/complete")
    @Operation(summary = "Moment abschließen", description = "Beendet einen Moment manuell und archiviert die Zusammenfassung für die Event-Historie")
    fun completeMoment(
        @PathVariable("momentId") momentIdValue: String
    ): ResponseEntity<MomentSummaryDto> {
        val principal = authContext.getRequiredPrincipal()
        val summary = momentService.completeMoment(momentId(momentIdValue), principal)
        return ResponseEntity.ok(summary)
    }

    @GetMapping("/history")
    @Operation(summary = "Moment-Historie auflisten", description = "Listet alle abgeschlossenen Momente, die das Mitglied sehen darf; optional nur die eines Events")
    fun listMomentHistory(
        @RequestParam("eventId", required = false) eventIdValue: String?
    ): ResponseEntity<List<MomentSummaryDto>> {
        val principal = authContext.getRequiredPrincipal()
        val history = momentService.listMomentHistory(principal, eventIdValue?.let { eventId(it) })
        return ResponseEntity.ok(history)
    }

    /**
     * Nimmt ein Bild oder Video als rohen Request-Körper entgegen (kein
     * Multipart): `Content-Type` ist der Dateityp, `Content-Length` Pflicht.
     * So kann der Körper ungepuffert in den Objektspeicher strömen.
     */
    @PostMapping("/{momentId}/media")
    @Operation(
        summary = "Bild oder Video hochladen",
        description = "Lädt ein Bild (JPEG/PNG/GIF) oder ein kurzes Video (MP4/MOV, bis 60 s) für einen eigenen Beitrag hoch"
    )
    fun uploadMedia(
        @PathVariable("momentId") momentIdValue: String,
        request: HttpServletRequest
    ): ResponseEntity<MomentMediaDto> {
        val principal = authContext.getRequiredPrincipal()
        val media = momentMediaService.upload(
            momentId(momentIdValue),
            request.contentType,
            request.contentLengthLong,
            request.inputStream,
            principal
        )
        return ResponseEntity.status(HttpStatus.CREATED).body(media)
    }

    /**
     * Liefert ein Bild oder Video entschlüsselt aus. Unterstützt einen einzelnen
     * `Range`-Bereich (`206`), damit Browser Videos abspielen und spulen können.
     */
    @GetMapping("/{momentId}/media/{mediaId}/content")
    @Operation(summary = "Bild oder Video abrufen", description = "Liefert eine Moment-Datei für berechtigte Mitglieder; Videos mit HTTP-Range")
    fun getMediaContent(
        @PathVariable("momentId") momentIdValue: String,
        @PathVariable("mediaId") mediaIdValue: String,
        @RequestHeader(HttpHeaders.RANGE, required = false) rangeHeader: String?,
        response: HttpServletResponse
    ) {
        val principal = authContext.getRequiredPrincipal()
        val content = momentMediaService.prepareContent(
            momentId(momentIdValue),
            mediaId(mediaIdValue),
            principal
        )
        val total = content.sizeBytes
        val range = parseRange(rangeHeader, total)
        if (range == INVALID_RANGE) {
            response.status = HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE.value()
            response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes */$total")
            return
        }
        val (start, end) = range ?: (0L to total - 1)
        val stream = momentMediaService.openRange(content, start, end)
        response.status = if (range != null) HttpStatus.PARTIAL_CONTENT.value() else HttpStatus.OK.value()
        response.contentType = content.contentType
        response.setContentLengthLong(end - start + 1)
        response.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes")
        if (range != null) response.setHeader(HttpHeaders.CONTENT_RANGE, "bytes $start-$end/$total")
        response.setHeader(HttpHeaders.CACHE_CONTROL, "private, no-store")
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION, "inline")
        response.setHeader("X-Content-Type-Options", "nosniff")
        stream.use { it.transferTo(response.outputStream) }
    }

    @DeleteMapping("/{momentId}/media/{mediaId}")
    @Operation(summary = "Bild oder Video entfernen", description = "Eigentümer, Event-Owner sowie Vorstand/Admin können eine Moment-Datei entfernen")
    fun deleteMedia(
        @PathVariable("momentId") momentIdValue: String,
        @PathVariable("mediaId") mediaIdValue: String
    ): ResponseEntity<Void> {
        val principal = authContext.getRequiredPrincipal()
        momentMediaService.delete(momentId(momentIdValue), mediaId(mediaIdValue), principal)
        return ResponseEntity.noContent().build()
    }

    companion object {
        private val INVALID_RANGE = -1L to -1L
        private val RANGE_PATTERN = Regex("""^bytes=(\d*)-(\d*)$""")

        /**
         * Wertet einen einzelnen Byte-Bereich aus. `null`: ganze Datei
         * (kein oder nicht unterstützter Header, etwa mehrere Bereiche).
         */
        internal fun parseRange(header: String?, total: Long): Pair<Long, Long>? {
            val match = header?.trim()?.let { RANGE_PATTERN.matchEntire(it) } ?: return null
            val (first, last) = match.destructured
            if (first.isEmpty() && last.isEmpty()) return null
            val start: Long
            val end: Long
            if (first.isEmpty()) {
                val suffix = last.toLongOrNull() ?: return null
                if (suffix <= 0) return INVALID_RANGE
                start = maxOf(0, total - suffix)
                end = total - 1
            } else {
                start = first.toLongOrNull() ?: return null
                end = if (last.isEmpty()) total - 1 else minOf(last.toLongOrNull() ?: return null, total - 1)
            }
            if (start >= total || start > end) return INVALID_RANGE
            return start to end
        }
    }
}
