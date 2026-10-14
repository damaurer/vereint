package de.maurer.baseservice.identity

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Anbindung an die Keycloak-Admin-API für die Registrierung per Einladungslink.
 *
 * Der Client `vereint-registration` ist vertraulich und besitzt nur das
 * Service-Account mit `realm-management/manage-users`. Sein Secret stammt
 * ausschließlich aus `KEYCLOAK_REGISTRATION_CLIENT_SECRET` und gelangt nie in
 * Browser oder SSR-HTML. Ist [enabled] `false` oder fehlt das Secret, lehnt der
 * Fachservice Registrierungen mit `503 registration_unavailable` ab.
 */
@ConfigurationProperties(prefix = "vereint.registration")
data class RegistrationProperties(
    val enabled: Boolean = false,
    /** Interne Basis-URL von Keycloak, z. B. `http://keycloak:8080/kc`. */
    val keycloakUrl: String = "",
    val realm: String = "vereint",
    val clientId: String = "vereint-registration",
    val clientSecret: String = "",
    val timeoutMillis: Long = 5000
) {
    val configured: Boolean
        get() = enabled && keycloakUrl.isNotBlank() && clientSecret.isNotBlank()

    override fun toString(): String =
        "RegistrationProperties(enabled=$enabled, keycloakUrl=$keycloakUrl, realm=$realm, clientId=$clientId)"
}
