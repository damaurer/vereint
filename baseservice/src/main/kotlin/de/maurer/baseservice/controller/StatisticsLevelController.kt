package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.CrossEventStatisticsDto
import de.maurer.baseservice.dto.EventStatisticsDto
import de.maurer.baseservice.dto.FeatureStatisticsDto
import de.maurer.baseservice.dto.GroupEventStatisticsDto
import de.maurer.baseservice.dto.MyStatisticsDto
import de.maurer.baseservice.dto.StatisticsDeletedDto
import de.maurer.baseservice.dto.StatisticsSettingsDto
import de.maurer.baseservice.dto.UpdateStatisticsSettingsRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.StatisticsLevelService
import de.maurer.baseservice.service.StatisticsSettingsService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * Statistik-Ebenen (eigene, übergreifende Event-, Gruppen-Event-, Event- und
 * Funktions-Statistik) sowie die Schalter und das Löschen. Zeitraum je
 * `zeitraum` (oder `period`): `30`, `90` (Standard) oder `jahr`.
 */
@RestController
@RequestMapping("/api/v1")
@Tag(name = "Statistik", description = "Statistik-Ebenen, Schalter und Löschen")
class StatisticsLevelController(
    private val levels: StatisticsLevelService,
    private val settings: StatisticsSettingsService,
    private val authContext: AuthContext
) {

    @GetMapping("/statistics/me")
    @Operation(summary = "Eigene Statistik", description = "Alles, was ich ausgelöst habe, über alle meine Gruppen; nur für mich")
    fun me(
        @RequestParam(required = false) zeitraum: String?,
        @RequestParam(required = false) period: String?
    ): ResponseEntity<MyStatisticsDto> = ResponseEntity.ok(levels.me(authContext.getRequiredPrincipal(), zeitraum ?: period))

    @GetMapping("/statistics/events")
    @Operation(summary = "Übergreifende Event-Statistik", description = "Alle sichtbaren Events aus allen eigenen Gruppen, ohne Namen anderer Personen")
    fun crossEvents(
        @RequestParam(required = false) zeitraum: String?,
        @RequestParam(required = false) period: String?
    ): ResponseEntity<CrossEventStatisticsDto> =
        ResponseEntity.ok(levels.crossEvents(authContext.getRequiredPrincipal(), zeitraum ?: period))

    @GetMapping("/statistics/group-events")
    @Operation(summary = "Gruppen-Event-Statistik", description = "Events der gewählten Gruppe zusammengefasst und im Vergleich")
    fun groupEvents(
        @RequestParam(required = false) zeitraum: String?,
        @RequestParam(required = false) period: String?
    ): ResponseEntity<GroupEventStatisticsDto> =
        ResponseEntity.ok(levels.groupEvents(authContext.getRequiredPrincipal(), zeitraum ?: period))

    @GetMapping("/statistics/features")
    @Operation(summary = "Funktions-Statistik", description = "Je Funktion, wie oft sie ausgelöst und wie darauf geantwortet wurde")
    fun features(
        @RequestParam(required = false) zeitraum: String?,
        @RequestParam(required = false) period: String?
    ): ResponseEntity<FeatureStatisticsDto> =
        ResponseEntity.ok(levels.features(authContext.getRequiredPrincipal(), zeitraum ?: period))

    @GetMapping("/events/{id}/statistics")
    @Operation(summary = "Event-Statistik", description = "Alles innerhalb eines Events; nur, wer das Event sehen darf")
    fun event(@PathVariable("id") id: String): ResponseEntity<EventStatisticsDto> =
        ResponseEntity.ok(levels.event(Identifiers.parseUuid(id, "id"), authContext.getRequiredPrincipal()))

    @GetMapping("/me/statistics-settings")
    @Operation(summary = "Eigener Schalter „Meine Statistik erfassen“")
    fun mySettings(): ResponseEntity<StatisticsSettingsDto> =
        ResponseEntity.ok(settings.mySettings(authContext.getRequiredPrincipal()))

    @PutMapping("/me/statistics-settings")
    @Operation(summary = "„Meine Statistik erfassen“ ein- oder ausschalten", description = "Wirkt ab sofort und löscht nichts")
    fun updateMySettings(@RequestBody request: UpdateStatisticsSettingsRequest): ResponseEntity<StatisticsSettingsDto> =
        ResponseEntity.ok(settings.updateMySettings(request, authContext.getRequiredPrincipal()))

    @DeleteMapping("/me/statistics")
    @Operation(summary = "Meine erfassten Statistikdaten löschen", description = "In allen Gruppen; Eintrag im Audit-Protokoll")
    fun deleteMine(): ResponseEntity<StatisticsDeletedDto> =
        ResponseEntity.ok(settings.deleteMyRecords(authContext.getRequiredPrincipal()))

    @GetMapping("/stammtisch/statistics-settings")
    @Operation(summary = "Schalter „Statistik in dieser Gruppe“")
    fun groupSettings(): ResponseEntity<StatisticsSettingsDto> =
        ResponseEntity.ok(settings.groupSettings(authContext.getRequiredPrincipal()))

    @PutMapping("/stammtisch/statistics-settings")
    @Operation(summary = "„Statistik in dieser Gruppe“ ein- oder ausschalten", description = "Erfordert stammtisch.manage")
    fun updateGroupSettings(@RequestBody request: UpdateStatisticsSettingsRequest): ResponseEntity<StatisticsSettingsDto> =
        ResponseEntity.ok(settings.updateGroupSettings(request, authContext.getRequiredPrincipal()))

    @DeleteMapping("/stammtisch/statistics")
    @Operation(summary = "Statistikdaten der Gruppe löschen", description = "Erfordert stammtisch.manage; Eintrag im Audit-Protokoll")
    fun deleteGroup(): ResponseEntity<StatisticsDeletedDto> =
        ResponseEntity.ok(settings.deleteGroupRecords(authContext.getRequiredPrincipal()))
}
