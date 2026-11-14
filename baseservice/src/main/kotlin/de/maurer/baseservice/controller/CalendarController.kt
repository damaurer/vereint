package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.CalendarDto
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.CalendarService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

/** Persönlicher Kalender über alle eigenen Gruppen. Läuft ohne gewählte Gruppe. */
@RestController
@RequestMapping("/api/v1/calendar")
@Tag(name = "Kalender", description = "Events und Moments aller eigenen Gruppen")
class CalendarController(
    private val calendarService: CalendarService,
    private val authContext: AuthContext
) {

    @GetMapping
    @Operation(
        summary = "Persönlicher Kalender",
        description = "Sichtbare Events und Moments aller eigenen Gruppen im Zeitraum [from, to), jeweils mit Gruppe"
    )
    fun calendar(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) from: Instant?,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) to: Instant?
    ): ResponseEntity<CalendarDto> =
        ResponseEntity.ok(calendarService.calendar(from, to, authContext.getRequiredPrincipal()))
}
