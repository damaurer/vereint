package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.ClubStatisticsDto
import de.maurer.baseservice.dto.DrinkStatisticsDto
import de.maurer.baseservice.dto.StatisticsOverviewDto
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.StatisticsService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * Statistik der Gruppe für alle Mitglieder. Setzt die Zustimmung zur gültigen
 * AGB-Fassung voraus (`403 terms_required`).
 */
@RestController
@RequestMapping("/api/v1/statistics")
@Tag(name = "Statistik", description = "Statistik der Gruppe für alle Mitglieder")
class StatisticsController(
    private val statisticsService: StatisticsService,
    private val authContext: AuthContext
) {

    @GetMapping
    @Operation(summary = "Statistik (Einstieg)", description = "Striche der Gruppe, eigene Striche, Platz, Rangliste und Zusagequote")
    fun statistics(
        @Parameter(description = "Zeitraum: 30, 90 (Standard) oder year (laufendes Kalenderjahr)")
        @RequestParam(required = false) period: String?
    ): ResponseEntity<ClubStatisticsDto> =
        ResponseEntity.ok(statisticsService.clubStatistics(authContext.getRequiredPrincipal(), period))

    @GetMapping("/drinks")
    @Operation(summary = "Getränkestatistik", description = "Getränke, Liter und Kalorien der Gruppe, nach Mitglied oder nach Getränk")
    fun drinks(
        @RequestParam(required = false) period: String?,
        @Parameter(description = "member (Standard) oder drink")
        @RequestParam(required = false) by: String?
    ): ResponseEntity<DrinkStatisticsDto> =
        ResponseEntity.ok(statisticsService.drinkStatistics(authContext.getRequiredPrincipal(), period, by))

    @GetMapping("/overview")
    @Operation(summary = "Statistik-Übersicht", description = "Alle Kennzahlen zu Events, Zusagen, Trinkverhalten, Getränken und Gemeinschaft; Umsatz nur mit Leserecht auf die Finanzen")
    fun overview(@RequestParam(required = false) period: String?): ResponseEntity<StatisticsOverviewDto> =
        ResponseEntity.ok(statisticsService.overview(authContext.getRequiredPrincipal(), period))
}
