package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.DrinkCatalogService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/v1/drinks")
@Tag(name = "Getränkekatalog", description = "Globaler Getränkekatalog, Barcodes, Vorschläge und Freigaben")
class DrinkCatalogController(
    private val drinkCatalogService: DrinkCatalogService,
    private val authContext: AuthContext
) {

    /**
     * Die API-Verträge liefern Kennungen als Zeichenkette; intern wird der native
     * UUID-Typ verwendet. Ungültige Eingaben werden hier in `400` überführt und
     * erreichen die Fachlogik nicht.
     */
    private fun drinkId(id: String) = Identifiers.parseUuid(id, "drinkId")

    private fun barcodeId(id: String) = Identifiers.parseUuid(id, "barcodeId")

    @GetMapping
    @Operation(summary = "Getränke auflisten", description = "Listet den globalen Katalog; nicht freigegebene Getränke nur für Vorstand/Admin")
    fun listDrinks(@RequestParam(required = false) status: String?): ResponseEntity<List<DrinkSummaryDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(drinkCatalogService.listDrinks(principal, status))
    }

    @GetMapping("/{id}")
    @Operation(summary = "Getränk abrufen", description = "Liefert ein Getränk inklusive Barcodes")
    fun getDrink(@PathVariable id: String): ResponseEntity<DrinkDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(drinkCatalogService.getDrink(drinkId(id), principal))
    }

    @GetMapping("/barcode/{barcode}")
    @Operation(summary = "Getränk per Barcode suchen", description = "Sucht ein freigegebenes Getränk anhand eines aktiven Barcodes")
    fun getDrinkByBarcode(@PathVariable barcode: String): ResponseEntity<DrinkDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(drinkCatalogService.getDrinkByBarcode(barcode, principal))
    }

    @PostMapping
    @Operation(summary = "Getränk vorschlagen", description = "Mitglieder schlagen ein Getränk zur Freigabe vor; Vorstand/Admin legen es direkt freigegeben an")
    fun proposeDrink(@Valid @RequestBody request: ProposeDrinkRequest): ResponseEntity<DrinkDto> {
        val principal = authContext.getRequiredPrincipal()
        val drink = drinkCatalogService.proposeDrink(request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(drink)
    }

    @PutMapping("/{id}")
    @Operation(summary = "Getränk aktualisieren", description = "Aktualisiert Stammdaten (Vorstand/Admin bzw. Vorschlagender am eigenen Vorschlag)")
    fun updateDrink(
        @PathVariable id: String,
        @Valid @RequestBody request: UpdateDrinkRequest
    ): ResponseEntity<DrinkDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(drinkCatalogService.updateDrink(drinkId(id), request, principal))
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "Getränk freigeben", description = "Gibt ein vorgeschlagenes Getränk frei (nur Vorstand/Admin)")
    fun approveDrink(@PathVariable id: String): ResponseEntity<DrinkDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(drinkCatalogService.approveDrink(drinkId(id), principal))
    }

    @PostMapping("/{id}/reject")
    @Operation(summary = "Getränk ablehnen", description = "Lehnt ein vorgeschlagenes Getränk ab (nur Vorstand/Admin)")
    fun rejectDrink(@PathVariable id: String): ResponseEntity<DrinkDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(drinkCatalogService.rejectDrink(drinkId(id), principal))
    }

    @PostMapping("/{id}/barcodes")
    @Operation(summary = "Barcode hinzufügen", description = "Fügt einem Getränk einen normalisierten, eindeutigen Barcode hinzu")
    fun addBarcode(
        @PathVariable id: String,
        @Valid @RequestBody request: AddBarcodeRequest
    ): ResponseEntity<DrinkBarcodeDto> {
        val principal = authContext.getRequiredPrincipal()
        val barcode = drinkCatalogService.addBarcode(drinkId(id), request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(barcode)
    }

    @DeleteMapping("/{id}/barcodes/{barcodeId}")
    @Operation(summary = "Barcode entfernen", description = "Entfernt einen Barcode von einem Getränk")
    fun removeBarcode(
        @PathVariable id: String,
        @PathVariable("barcodeId") barcode: String
    ): ResponseEntity<Void> {
        val principal = authContext.getRequiredPrincipal()
        drinkCatalogService.removeBarcode(drinkId(id), barcodeId(barcode), principal)
        return ResponseEntity.noContent().build()
    }
}
