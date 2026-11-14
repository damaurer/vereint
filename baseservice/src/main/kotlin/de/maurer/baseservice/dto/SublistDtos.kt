package de.maurer.baseservice.dto

import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Digits
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.math.BigDecimal
import java.time.Instant

data class CreateSublistRequest(
    @field:NotBlank(message = "name {validation.notBlank}")
    @field:Size(max = 255, message = "name {validation.size.max}")
    val name: String? = null,

    @field:Size(max = 4000, message = "description {validation.size.max}")
    val description: String? = null
)

data class UpdateSublistRequest(
    @field:Size(min = 1, max = 255, message = "name {validation.size.range}")
    val name: String? = null,

    @field:Size(max = 4000, message = "description {validation.size.max}")
    val description: String? = null
)

data class AddSublistItemRequest(
    @field:NotBlank(message = "drinkId {validation.notBlank}")
    val drinkId: String? = null,

    @field:DecimalMin(value = "0.00", message = "defaultPrice {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "defaultPrice {validation.digits}")
    val defaultPrice: BigDecimal? = null
)

data class SublistItemDto(
    val id: String,
    val drinkId: String,
    val drinkName: String,
    val defaultPrice: BigDecimal?
)

data class SublistDto(
    val id: String,
    val name: String,
    val description: String?,
    val createdById: String?,
    val items: List<SublistItemDto>,
    val createdAt: Instant,
    val updatedAt: Instant
)

data class SublistSummaryDto(
    val id: String,
    val name: String,
    val description: String?,
    val itemCount: Int
)
