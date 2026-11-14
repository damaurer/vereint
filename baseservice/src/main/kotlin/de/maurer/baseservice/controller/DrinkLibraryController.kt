package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.DrinkLibraryEntryDto
import de.maurer.baseservice.dto.SaveDrinkLibraryEntryRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.DrinkLibraryService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/** Gemeinsame Getränkedatenbank aller Stammtische (nur Stammdaten, keine Preise). */
@RestController
@RequestMapping("/api/v1/drink-library")
@Tag(name = "Getränkedatenbank", description = "Gemeinsame Getränke-Stammdaten zum Übernehmen in den eigenen Katalog")
class DrinkLibraryController(
    private val drinkLibraryService: DrinkLibraryService,
    private val authContext: AuthContext
) {

    @GetMapping
    @Operation(summary = "Getränkedatenbank durchsuchen", description = "Suche nach Name oder Sorte, oder exakt nach Barcode")
    fun search(
        @RequestParam(name = "q", required = false) query: String?,
        @RequestParam(name = "barcode", required = false) barcode: String?
    ): ResponseEntity<List<DrinkLibraryEntryDto>> =
        ResponseEntity.ok(drinkLibraryService.search(authContext.getRequiredPrincipal(), query, barcode))

    @GetMapping("/{id}")
    @Operation(summary = "Eintrag der Getränkedatenbank")
    fun get(@PathVariable("id") id: String): ResponseEntity<DrinkLibraryEntryDto> =
        ResponseEntity.ok(drinkLibraryService.get(Identifiers.parseUuid(id, "id"), authContext.getRequiredPrincipal()))

    @PutMapping("/{id}")
    @Operation(summary = "Eintrag korrigieren", description = "Nur Plattform-Administration")
    fun update(
        @PathVariable("id") id: String,
        @Valid @RequestBody request: SaveDrinkLibraryEntryRequest
    ): ResponseEntity<DrinkLibraryEntryDto> =
        ResponseEntity.ok(drinkLibraryService.update(Identifiers.parseUuid(id, "id"), request, authContext.getRequiredPrincipal()))

    @DeleteMapping("/{id}")
    @Operation(summary = "Eintrag entfernen", description = "Nur Plattform-Administration; Kataloge behalten ihre Kopie")
    fun delete(@PathVariable("id") id: String): ResponseEntity<Void> {
        drinkLibraryService.delete(Identifiers.parseUuid(id, "id"), authContext.getRequiredPrincipal())
        return ResponseEntity.noContent().build()
    }
}
