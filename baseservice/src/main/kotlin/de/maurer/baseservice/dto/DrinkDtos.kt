package de.maurer.baseservice.dto

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.Valid
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Digits
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.math.BigDecimal
import java.time.Instant

/** Dreistelliger ISO-4217-Währungscode; die Normalisierung erfolgt serverseitig in Großbuchstaben. */
private const val CURRENCY_PATTERN = "^[A-Za-z]{3}$"

/**
 * Füllmenge und Kalorien je Portion. Beim Ändern ersetzt das Objekt beide Werte;
 * `null` heißt dann „keine Angabe“. Fehlt das Objekt, bleiben die Werte unverändert.
 */
data class DrinkNutritionRequest(
    @field:Min(value = 1, message = "volumeMl {validation.notNegative}")
    @field:Max(value = 10000, message = "volumeMl {validation.size.max}")
    val volumeMl: Int? = null,

    @field:Min(value = 0, message = "kcalPerServing {validation.notNegative}")
    @field:Max(value = 10000, message = "kcalPerServing {validation.size.max}")
    val kcalPerServing: Int? = null
)

data class ProposeDrinkRequest(
    @field:NotBlank(message = "name {validation.notBlank}")
    @field:Size(max = 255, message = "name {validation.size.max}")
    val name: String? = null,

    @field:Size(max = 4000, message = "description {validation.size.max}")
    val description: String? = null,

    @field:Size(max = 64, message = "category {validation.size.max}")
    val category: String? = null,

    @field:NotNull(message = "defaultPrice {validation.required}")
    @field:DecimalMin(value = "0.00", message = "defaultPrice {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "defaultPrice {validation.digits}")
    val defaultPrice: BigDecimal? = null,

    @field:DecimalMin(value = "0.00", message = "costPrice {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "costPrice {validation.digits}")
    val costPrice: BigDecimal? = null,

    @field:Pattern(regexp = CURRENCY_PATTERN, message = "currency {validation.currency}")
    val currency: String? = null,

    @field:Size(max = 512, message = "imageReference {validation.size.max}")
    val imageReference: String? = null,

    @field:Size(max = 64, message = "barcodes {validation.size.maxEntries}")
    val barcodes: List<String>? = null,

    @Schema(description = "Eintrag der gemeinsamen Getränkedatenbank, aus dem das Getränk übernommen wird")
    val libraryDrinkId: String? = null,

    @field:Valid
    @Schema(description = "Füllmenge und Kalorien; ohne Angabe gelten die Werte der Getränkedatenbank")
    val nutrition: DrinkNutritionRequest? = null,
    @Schema(description = "Strich-Kategorie (nur Vorstand/Admin); leer = ohne Kategorie")
    val tallyCategoryId: String? = null
)

data class UpdateDrinkRequest(
    @field:Size(min = 1, max = 255, message = "name {validation.size.range}")
    val name: String? = null,

    @field:Size(max = 4000, message = "description {validation.size.max}")
    val description: String? = null,

    @field:Size(max = 64, message = "category {validation.size.max}")
    val category: String? = null,

    @field:DecimalMin(value = "0.00", message = "defaultPrice {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "defaultPrice {validation.digits}")
    val defaultPrice: BigDecimal? = null,

    @field:DecimalMin(value = "0.00", message = "costPrice {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "costPrice {validation.digits}")
    val costPrice: BigDecimal? = null,

    @field:Pattern(regexp = CURRENCY_PATTERN, message = "currency {validation.currency}")
    val currency: String? = null,

    @field:Size(max = 512, message = "imageReference {validation.size.max}")
    val imageReference: String? = null,

    val active: Boolean? = null,

    @field:Valid
    @Schema(description = "Füllmenge und Kalorien; ersetzt beide Werte, fehlt es, bleiben sie unverändert")
    val nutrition: DrinkNutritionRequest? = null,
    @Schema(description = "Strich-Kategorie (nur Vorstand/Admin); null = unverändert, leer = ohne Kategorie")
    val tallyCategoryId: String? = null
)

data class AddBarcodeRequest(
    @field:NotBlank(message = "barcode {validation.notBlank}")
    @field:Size(max = 128, message = "barcode {validation.size.max}")
    val barcode: String? = null
)

data class DrinkBarcodeDto(
    val id: String,
    val barcode: String,
    val active: Boolean
)

data class DrinkDto(
    val id: String,
    val name: String,
    val description: String?,
    val category: String?,
    val defaultPrice: BigDecimal,
    val costPrice: BigDecimal = BigDecimal.ZERO,
    val currency: String,
    val imageReference: String?,
    val catalogVersion: Int,
    val status: String,
    val active: Boolean,
    val proposedById: String?,
    val approvedById: String?,
    val barcodes: List<DrinkBarcodeDto>,
    val createdAt: Instant,
    val updatedAt: Instant,
    @Schema(description = "Herkunft aus der gemeinsamen Getränkedatenbank")
    val libraryDrinkId: String? = null,
    @Schema(description = "Füllmenge einer Portion in ml")
    val volumeMl: Int? = null,
    @Schema(description = "Kalorien je Portion")
    val kcalPerServing: Int? = null,
    val tallyCategoryId: String? = null,
    val tallyCategoryName: String? = null,
    @Schema(description = "Preis je Strich der Kategorie; überschreibt den Verkaufspreis")
    val tallyCategoryPrice: BigDecimal? = null
)

data class DrinkSummaryDto(
    val id: String,
    val name: String,
    val category: String?,
    val defaultPrice: BigDecimal,
    val costPrice: BigDecimal = BigDecimal.ZERO,
    val currency: String,
    val status: String,
    val active: Boolean,
    val catalogVersion: Int,
    val tallyCategoryId: String? = null,
    val tallyCategoryName: String? = null,
    val tallyCategoryPrice: BigDecimal? = null
)

@Schema(description = "Eintrag der gemeinsamen Getränkedatenbank (ohne Preis)")
data class DrinkLibraryEntryDto(
    val id: String,
    val name: String,
    val description: String?,
    val category: String?,
    val barcodes: List<String>,
    @Schema(description = "Id des Katalogeintrags im aktuellen Stammtisch, falls schon übernommen")
    val catalogDrinkId: String? = null,
    val volumeMl: Int? = null,
    val kcalPerServing: Int? = null
)

data class SaveDrinkLibraryEntryRequest(
    @field:Size(max = 255, message = "name {validation.size.max}")
    val name: String? = null,
    val description: String? = null,
    @field:Size(max = 64, message = "category {validation.size.max}")
    val category: String? = null,
    @field:Size(max = 64, message = "barcodes {validation.size.maxEntries}")
    val barcodes: List<String>? = null,
    @field:Valid
    val nutrition: DrinkNutritionRequest? = null
)
