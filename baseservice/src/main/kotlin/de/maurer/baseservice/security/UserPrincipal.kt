package de.maurer.baseservice.security

import com.fasterxml.jackson.annotation.JsonIgnore
import java.io.Serializable

data class UserPrincipal(
    val subject: String,
    val email: String? = null,
    val displayName: String? = null,
    val roles: Set<String> = emptySet(),
    val permissions: Set<String> = emptySet(),
    val boardRole: String? = null,
    val drinkRecorder: Boolean = false,
    val eventScopes: Set<String> = emptySet(),
    /** Keycloak-Realm-Rolle `admin`: darf Stammtische anlegen und die Getränkedatenbank pflegen. */
    val platformAdmin: Boolean = false,
    /** Stammtisch, für den [roles] und [permissions] gelten; `null` ohne Stammtisch-Kontext. */
    val stammtischId: String? = null,
    /**
     * Rohe Token-Claims ausschließlich für die serverseitige Auswertung.
     * Sie dürfen niemals an einen Client serialisiert werden.
     */
    @field:JsonIgnore
    @get:JsonIgnore
    val attributes: Map<String, Any> = emptyMap()
) : Serializable {
    fun hasRole(role: String): Boolean = roles.contains(role)
    fun hasPermission(permission: String): Boolean = permissions.contains(permission)
    fun hasEventScope(eventId: String): Boolean = eventScopes.contains(eventId)
}
