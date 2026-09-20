package de.maurer.baseservice.dto

import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Digits
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.math.BigDecimal
import java.time.Instant

/** Dreistelliger ISO-4217-Währungscode; die Normalisierung erfolgt serverseitig in Großbuchstaben. */
private const val CURRENCY_PATTERN = "^[A-Za-z]{3}$"

data class ProposeDrinkRequest(
    @field:NotBlank(message = "name darf nicht leer sein")
    @field:Size(max = 255, message = "name darf höchstens 255 Zeichen lang sein")
    val name: String? = null,

    @field:Size(max = 4000, message = "description darf höchstens 4000 Zeichen lang sein")
    val description: String? = null,

    @field:Size(max = 64, message = "category darf höchstens 64 Zeichen lang sein")
    val category: String? = null,

    @field:NotNull(message = "defaultPrice ist erforderlich")
    @field:DecimalMin(value = "0.00", message = "defaultPrice darf nicht negativ sein")
    @field:Digits(integer = 8, fraction = 2, message = "defaultPrice erlaubt höchstens 8 Vor- und 2 Nachkommastellen")
    val defaultPrice: BigDecimal? = null,

    @field:DecimalMin(value = "0.00", message = "costPrice darf nicht negativ sein")
    @field:Digits(integer = 8, fraction = 2, message = "costPrice erlaubt höchstens 8 Vor- und 2 Nachkommastellen")
    val costPrice: BigDecimal? = null,

    @field:Pattern(regexp = CURRENCY_PATTERN, message = "currency muss ein dreistelliger Währungscode sein")
    val currency: String? = null,

    @field:Size(max = 512, message = "imageReference darf höchstens 512 Zeichen lang sein")
    val imageReference: String? = null,

    @field:Size(max = 64, message = "barcodes darf höchstens 64 Einträge enthalten")
    val barcodes: List<String>? = null
)

data class UpdateDrinkRequest(
    @field:Size(min = 1, max = 255, message = "name muss zwischen 1 und 255 Zeichen lang sein")
    val name: String? = null,

    @field:Size(max = 4000, message = "description darf höchstens 4000 Zeichen lang sein")
    val description: String? = null,

    @field:Size(max = 64, message = "category darf höchstens 64 Zeichen lang sein")
    val category: String? = null,

    @field:DecimalMin(value = "0.00", message = "defaultPrice darf nicht negativ sein")
    @field:Digits(integer = 8, fraction = 2, message = "defaultPrice erlaubt höchstens 8 Vor- und 2 Nachkommastellen")
    val defaultPrice: BigDecimal? = null,

    @field:DecimalMin(value = "0.00", message = "costPrice darf nicht negativ sein")
    @field:Digits(integer = 8, fraction = 2, message = "costPrice erlaubt höchstens 8 Vor- und 2 Nachkommastellen")
    val costPrice: BigDecimal? = null,

    @field:Pattern(regexp = CURRENCY_PATTERN, message = "currency muss ein dreistelliger Währungscode sein")
    val currency: String? = null,

    @field:Size(max = 512, message = "imageReference darf höchstens 512 Zeichen lang sein")
    val imageReference: String? = null,

    val active: Boolean? = null
)

data class AddBarcodeRequest(
    @field:NotBlank(message = "barcode darf nicht leer sein")
    @field:Size(max = 128, message = "barcode darf höchstens 128 Zeichen lang sein")
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
    val updatedAt: Instant
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
    val catalogVersion: Int
)
