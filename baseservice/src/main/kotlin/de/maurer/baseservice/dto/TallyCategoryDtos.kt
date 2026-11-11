package de.maurer.baseservice.dto

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Digits
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size
import java.math.BigDecimal

/** Getränk, das einer Strich-Kategorie zugeordnet ist. */
data class TallyCategoryDrinkDto(
    val id: String,
    val name: String,
    @Schema(description = "Eigener Verkaufspreis; die Theke rechnet mit dem Kategoriepreis")
    val defaultPrice: BigDecimal,
    val currency: String
)

@Schema(description = "Strich-Kategorie: eine Spalte der Strichliste am Thekenterminal")
data class TallyCategoryDto(
    val id: String,
    val name: String,
    @Schema(description = "Preis je Strich; überschreibt den Verkaufspreis der Getränke")
    val price: BigDecimal,
    val currency: String,
    val sortOrder: Int,
    val drinks: List<TallyCategoryDrinkDto> = emptyList()
)

data class CreateTallyCategoryRequest(
    @field:NotBlank(message = "name {validation.notBlank}")
    @field:Size(max = 64, message = "name {validation.size.max}")
    val name: String? = null,

    @field:NotNull(message = "price {validation.required}")
    @field:DecimalMin(value = "0.00", message = "price {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "price {validation.digits}")
    val price: BigDecimal? = null
)

data class UpdateTallyCategoryRequest(
    @field:Size(min = 1, max = 64, message = "name {validation.size.range}")
    val name: String? = null,

    @field:DecimalMin(value = "0.00", message = "price {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "price {validation.digits}")
    val price: BigDecimal? = null
)

@Schema(description = "Neue Reihenfolge der Kategorien (= Spaltenreihenfolge am Terminal)")
data class ReorderTallyCategoriesRequest(
    @field:NotNull(message = "ids {validation.required}")
    val ids: List<String>? = null
)
