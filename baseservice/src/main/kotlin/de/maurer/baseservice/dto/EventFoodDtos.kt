package de.maurer.baseservice.dto

import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Digits
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import java.math.BigDecimal
import java.time.Instant

private const val EVENT_FOOD_CURRENCY_PATTERN = "^[A-Za-z]{3}$"

data class AddEventFoodRequest(
    @field:NotBlank(message = "foodId {validation.notBlank}")
    val foodId: String? = null,

    @field:DecimalMin(value = "0.00", message = "price {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "price {validation.digits}")
    val price: BigDecimal? = null,

    @field:DecimalMin(value = "0.00", message = "costPrice {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "costPrice {validation.digits}")
    val costPrice: BigDecimal? = null,

    @field:Pattern(regexp = EVENT_FOOD_CURRENCY_PATTERN, message = "currency {validation.currency}")
    val currency: String? = null,

    val selfServiceEnabled: Boolean? = null,

    val tabletEnabled: Boolean? = null
)

data class UpdateEventFoodRequest(
    @field:DecimalMin(value = "0.00", message = "price {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "price {validation.digits}")
    val price: BigDecimal? = null,

    @field:DecimalMin(value = "0.00", message = "costPrice {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "costPrice {validation.digits}")
    val costPrice: BigDecimal? = null,

    @field:Pattern(regexp = EVENT_FOOD_CURRENCY_PATTERN, message = "currency {validation.currency}")
    val currency: String? = null,

    val selfServiceEnabled: Boolean? = null,

    val tabletEnabled: Boolean? = null
)

data class EventFoodDto(
    val id: String,
    val eventId: String,
    val foodId: String,
    val foodName: String,
    val price: BigDecimal?,
    val effectivePrice: BigDecimal,
    val costPrice: BigDecimal?,
    val effectiveCostPrice: BigDecimal,
    val currency: String,
    val selfServiceEnabled: Boolean,
    val tabletEnabled: Boolean,
    val createdAt: Instant,
    val updatedAt: Instant
)
