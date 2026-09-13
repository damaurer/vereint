package de.maurer.baseservice.dto

/**
 * Antwortvertrag von `GET /api/v1/auth/me`.
 *
 * Bewusst reduziert auf die fachlich benötigten Felder; rohe Token-Claims werden
 * nicht ausgeliefert.
 */
data class AuthContextDto(
    val subject: String,
    val displayName: String?,
    val roles: Set<String>,
    val boardRole: String?,
    val permissions: Set<String>
)
