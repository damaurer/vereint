package de.maurer.baseservice.dto

import jakarta.validation.Constraint
import jakarta.validation.ConstraintValidator
import jakarta.validation.ConstraintValidatorContext
import jakarta.validation.Payload
import kotlin.reflect.KClass

/**
 * Prüft, dass alle Elemente einer Sammlung formal gültige Rollenkürzel sind
 * (Buchstabe am Anfang, danach Buchstaben, Ziffern oder Bindestriche, höchstens
 * 64 Zeichen). Ob es die Rolle in der Gruppe gibt, prüft der Fachservice, weil
 * jede Gruppe neben den Systemrollen eigene Rollen anlegen kann.
 *
 * Bewusst als eigene Constraint-Annotation umgesetzt: Kotlin gibt Constraints auf
 * Typargumenten (`Set<@Pattern String>`) nicht zuverlässig als Type-Use-Annotationen
 * aus, sodass Container-Element-Constraints nicht ausgewertet würden.
 */
@Target(AnnotationTarget.FIELD, AnnotationTarget.VALUE_PARAMETER, AnnotationTarget.PROPERTY)
@Retention(AnnotationRetention.RUNTIME)
@MustBeDocumented
@Constraint(validatedBy = [RoleCodesValidator::class])
annotation class RoleCodes(
    val message: String = "enthält ein ungültiges Rollenkürzel",
    val groups: Array<KClass<*>> = [],
    val payload: Array<KClass<out Payload>> = []
)

class RoleCodesValidator : ConstraintValidator<RoleCodes, Any?> {

    override fun isValid(value: Any?, context: ConstraintValidatorContext?): Boolean = when (value) {
        null -> true
        is Collection<*> -> value.all { it is String && ROLE_CODE.matches(it) }
        else -> false
    }

    private companion object {
        val ROLE_CODE = Regex("^[A-Za-z][A-Za-z0-9-]{0,63}$")
    }
}
