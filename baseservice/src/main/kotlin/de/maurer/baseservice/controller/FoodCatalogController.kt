package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.CreateFoodRequest
import de.maurer.baseservice.dto.FoodDto
import de.maurer.baseservice.dto.FoodSummaryDto
import de.maurer.baseservice.dto.UpdateFoodRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.FoodCatalogService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/v1/food")
@Tag(name = "Speisenkatalog", description = "Globaler Speisenkatalog des Vereins und Stammdatenpflege")
class FoodCatalogController(
    private val foodCatalogService: FoodCatalogService,
    private val authContext: AuthContext
) {

    private fun foodId(id: String) = Identifiers.parseUuid(id, "foodId")

    @GetMapping
    @Operation(summary = "Speisen auflisten", description = "Listet den globalen Speisenkatalog; inaktive Speisen nur für Vorstand/Admin")
    fun listFoods(@RequestParam(required = false) active: Boolean?): ResponseEntity<List<FoodSummaryDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(foodCatalogService.listFoods(principal, active))
    }

    @GetMapping("/{id}")
    @Operation(summary = "Speise abrufen", description = "Liefert eine Speise anhand ihrer Kennung")
    fun getFood(@PathVariable id: String): ResponseEntity<FoodDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(foodCatalogService.getFood(foodId(id), principal))
    }

    @PostMapping
    @Operation(summary = "Speise anlegen", description = "Erstellt eine neue Speise im globalen Vereinskatalog (nur Vorstand/Admin)")
    fun createFood(@Valid @RequestBody request: CreateFoodRequest): ResponseEntity<FoodDto> {
        val principal = authContext.getRequiredPrincipal()
        val food = foodCatalogService.createFood(request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(food)
    }

    @PutMapping("/{id}")
    @Operation(summary = "Speise aktualisieren", description = "Aktualisiert eine Speise im globalen Vereinskatalog (nur Vorstand/Admin)")
    fun updateFood(
        @PathVariable id: String,
        @Valid @RequestBody request: UpdateFoodRequest
    ): ResponseEntity<FoodDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(foodCatalogService.updateFood(foodId(id), request, principal))
    }
}
