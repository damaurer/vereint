package de.maurer.baseservice.dto

import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Digits
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import java.math.BigDecimal
import java.time.Instant

private const val EVENT_FOOD_CURRENCY_PATTERN = "^[A-Za-z]{3}$"

data class AddEventFoodRequest(
    @field:NotBlank(message = "foodId darf nicht leer sein")
    val foodId: String? = null,

    @field:DecimalMin(value = "0.00", message = "price darf nicht negativ sein")
    @field:Digits(integer = 8, fraction = 2, message = "price erlaubt höchstens 8 Vor- und 2 Nachkommastellen")
    val price: BigDecimal? = null,

    @field:DecimalMin(value = "0.00", message = "costPrice darf nicht negativ sein")
    @field:Digits(integer = 8, fraction = 2, message = "costPrice erlaubt höchstens 8 Vor- und 2 Nachkommastellen")
    val costPrice: BigDecimal? = null,

    @field:Pattern(regexp = EVENT_FOOD_CURRENCY_PATTERN, message = "currency muss ein dreistelliger Währungscode sein")
    val currency: String? = null,

    val selfServiceEnabled: Boolean? = null,

    val tabletEnabled: Boolean? = null
)

data class UpdateEventFoodRequest(
    @field:DecimalMin(value = "0.00", message = "price darf nicht negativ sein")
    @field:Digits(integer = 8, fraction = 2, message = "price erlaubt höchstens 8 Vor- und 2 Nachkommastellen")
    val price: BigDecimal? = null,

    @field:DecimalMin(value = "0.00", message = "costPrice darf nicht negativ sein")
    @field:Digits(integer = 8, fraction = 2, message = "costPrice erlaubt höchstens 8 Vor- und 2 Nachkommastellen")
    val costPrice: BigDecimal? = null,

    @field:Pattern(regexp = EVENT_FOOD_CURRENCY_PATTERN, message = "currency muss ein dreistelliger Währungscode sein")
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
