package de.maurer.baseservice.dto

import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Digits
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import java.math.BigDecimal
import java.time.Instant

/** Dreistelliger ISO-4217-Währungscode; die Normalisierung erfolgt serverseitig in Großbuchstaben. */
private const val EVENT_DRINK_CURRENCY_PATTERN = "^[A-Za-z]{3}$"

data class AddEventDrinkRequest(
    @field:NotBlank(message = "drinkId {validation.notBlank}")
    val drinkId: String? = null,

    @field:DecimalMin(value = "0.00", message = "price {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "price {validation.digits}")
    val price: BigDecimal? = null,

    @field:DecimalMin(value = "0.00", message = "costPrice {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "costPrice {validation.digits}")
    val costPrice: BigDecimal? = null,

    @field:Pattern(regexp = EVENT_DRINK_CURRENCY_PATTERN, message = "currency {validation.currency}")
    val currency: String? = null,

    val selfServiceEnabled: Boolean? = null,

    val tabletEnabled: Boolean? = null
)

data class UpdateEventDrinkRequest(
    @field:DecimalMin(value = "0.00", message = "price {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "price {validation.digits}")
    val price: BigDecimal? = null,

    @field:DecimalMin(value = "0.00", message = "costPrice {validation.notNegative}")
    @field:Digits(integer = 8, fraction = 2, message = "costPrice {validation.digits}")
    val costPrice: BigDecimal? = null,

    @field:Pattern(regexp = EVENT_DRINK_CURRENCY_PATTERN, message = "currency {validation.currency}")
    val currency: String? = null,

    val selfServiceEnabled: Boolean? = null,

    val tabletEnabled: Boolean? = null
)

data class AssignSublistRequest(
    @field:NotBlank(message = "sublistId {validation.notBlank}")
    val sublistId: String? = null
)

data class EventDrinkDto(
    val id: String,
    val eventId: String,
    val drinkId: String,
    val drinkName: String,
    val price: BigDecimal,
    val costPrice: BigDecimal? = null,
    val effectiveCostPrice: BigDecimal = BigDecimal.ZERO,
    val currency: String,
    val selfServiceEnabled: Boolean,
    val tabletEnabled: Boolean,
    val catalogVersion: Int,
    val imageSnapshot: String?,
    val createdAt: Instant,
    val updatedAt: Instant
)
