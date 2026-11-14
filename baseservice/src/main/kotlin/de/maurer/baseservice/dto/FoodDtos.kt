package de.maurer.baseservice.dto

import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Digits
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.math.BigDecimal
import java.time.Instant

private const val FOOD_CURRENCY_PATTERN = "^[A-Za-z]{3}$"

data class CreateFoodRequest(
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

    @field:Pattern(regexp = FOOD_CURRENCY_PATTERN, message = "currency {validation.currency}")
    val currency: String? = null
)

data class UpdateFoodRequest(
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

    @field:Pattern(regexp = FOOD_CURRENCY_PATTERN, message = "currency {validation.currency}")
    val currency: String? = null,

    val active: Boolean? = null
)

data class FoodDto(
    val id: String,
    val name: String,
    val description: String?,
    val category: String?,
    val defaultPrice: BigDecimal,
    val costPrice: BigDecimal,
    val currency: String,
    val active: Boolean,
    val createdById: String?,
    val createdAt: Instant,
    val updatedAt: Instant
)

data class FoodSummaryDto(
    val id: String,
    val name: String,
    val category: String?,
    val defaultPrice: BigDecimal,
    val costPrice: BigDecimal,
    val currency: String,
    val active: Boolean
)
