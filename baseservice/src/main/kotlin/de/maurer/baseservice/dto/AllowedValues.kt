package de.maurer.baseservice.dto

import jakarta.validation.Constraint
import jakarta.validation.ConstraintValidator
import jakarta.validation.ConstraintValidatorContext
import jakarta.validation.Payload
import kotlin.reflect.KClass

/**
 * Prüft, dass ein einzelner Wert oder alle Elemente einer Sammlung zu einer
 * abgeschlossenen Werteliste gehören.
 *
 * Bewusst als eigene Constraint-Annotation umgesetzt: Kotlin gibt Constraints auf
 * Typargumenten (`Set<@Pattern String>`) nicht zuverlässig als Type-Use-Annotationen
 * aus, sodass Container-Element-Constraints nicht ausgewertet würden.
 */
@Target(AnnotationTarget.FIELD, AnnotationTarget.VALUE_PARAMETER, AnnotationTarget.PROPERTY)
@Retention(AnnotationRetention.RUNTIME)
@MustBeDocumented
@Constraint(validatedBy = [AllowedValuesValidator::class])
annotation class AllowedValues(
    val values: Array<String>,
    val allowBlank: Boolean = false,
    val message: String = "enthält einen nicht zugelassenen Wert",
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = []
)

class AllowedValuesValidator : ConstraintValidator<AllowedValues, Any?> {

    private var allowed: Set<String> = emptySet()
    private var allowBlank: Boolean = false

    override fun initialize(constraintAnnotation: AllowedValues) {
        allowed = constraintAnnotation.values.toSet()
        allowBlank = constraintAnnotation.allowBlank
    }

    override fun isValid(value: Any?, context: ConstraintValidatorContext?): Boolean = when (value) {
        null -> true
        is String -> isValidElement(value)
        is Collection<*> -> value.all { it is String && isValidElement(it) }
        else -> false
    }

    private fun isValidElement(element: String): Boolean =
        if (element.isBlank()) allowBlank else allowed.contains(element)
}
