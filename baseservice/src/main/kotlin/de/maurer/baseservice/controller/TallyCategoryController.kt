package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.CreateTallyCategoryRequest
import de.maurer.baseservice.dto.ReorderTallyCategoriesRequest
import de.maurer.baseservice.dto.TallyCategoryDto
import de.maurer.baseservice.dto.UpdateTallyCategoryRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.TallyCategoryService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/** Strich-Kategorien: Spalten der Strichliste am Thekenterminal (Issue #80). */
@RestController
@RequestMapping("/api/v1/tally-categories")
@Tag(name = "Strich-Kategorien", description = "Spalten der Strichliste mit Preis je Strich")
class TallyCategoryController(
    private val tallyCategoryService: TallyCategoryService,
    private val authContext: AuthContext
) {

    private fun categoryId(id: String) = Identifiers.parseUuid(id, "categoryId")

    @GetMapping
    @Operation(summary = "Kategorien auflisten", description = "Kategorien in Spaltenreihenfolge samt zugeordneten Getränken")
    fun list(): ResponseEntity<List<TallyCategoryDto>> =
        ResponseEntity.ok(tallyCategoryService.list(authContext.getRequiredPrincipal()))

    @PostMapping
    @Operation(summary = "Kategorie anlegen", description = "Legt eine neue Spalte an (catalog.approve)")
    fun create(@Valid @RequestBody request: CreateTallyCategoryRequest): ResponseEntity<TallyCategoryDto> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(tallyCategoryService.create(request, authContext.getRequiredPrincipal()))

    @PutMapping("/order")
    @Operation(summary = "Kategorien sortieren", description = "Setzt die Spaltenreihenfolge (catalog.approve)")
    fun reorder(@Valid @RequestBody request: ReorderTallyCategoriesRequest): ResponseEntity<List<TallyCategoryDto>> =
        ResponseEntity.ok(tallyCategoryService.reorder(request, authContext.getRequiredPrincipal()))

    @PutMapping("/{id}")
    @Operation(summary = "Kategorie ändern", description = "Ändert Name oder Preis je Strich (catalog.approve)")
    fun update(
        @PathVariable id: String,
        @Valid @RequestBody request: UpdateTallyCategoryRequest
    ): ResponseEntity<TallyCategoryDto> =
        ResponseEntity.ok(tallyCategoryService.update(categoryId(id), request, authContext.getRequiredPrincipal()))

    @DeleteMapping("/{id}")
    @Operation(summary = "Kategorie löschen", description = "Getränke fallen auf „Ohne“ zurück (catalog.approve)")
    fun delete(@PathVariable id: String): ResponseEntity<Void> {
        tallyCategoryService.delete(categoryId(id), authContext.getRequiredPrincipal())
        return ResponseEntity.noContent().build()
    }
}
