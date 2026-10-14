package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.ClubStatisticsDto
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.StatisticsService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/statistics")
@Tag(name = "Statistik", description = "Vereinsstatistik für alle Angemeldeten")
class StatisticsController(
    private val statisticsService: StatisticsService,
    private val authContext: AuthContext
) {

    @GetMapping
    @Operation(summary = "Vereinsstatistik", description = "Konsum, Ranglisten, Umsatzverlauf und Zusagequote der letzten 90 Tage")
    fun statistics(): ResponseEntity<ClubStatisticsDto> =
        ResponseEntity.ok(statisticsService.clubStatistics(authContext.getRequiredPrincipal()))
}
