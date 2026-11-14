package de.maurer.baseservice.config

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.identity.DisabledIdentityProvisioner
import de.maurer.baseservice.identity.IdentityProvisioner
import de.maurer.baseservice.identity.KeycloakIdentityProvisioner
import de.maurer.baseservice.identity.RegistrationProperties
import org.slf4j.LoggerFactory
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * Auswahl der Kontoanlage für die Registrierung per Einladungslink. Ohne
 * vollständige Konfiguration greift [DisabledIdentityProvisioner]; Einladungen
 * lassen sich dann zwar erzeugen, die Registrierung antwortet aber mit `503`.
 */
@Configuration
@EnableConfigurationProperties(RegistrationProperties::class)
class RegistrationConfig {

    private val log = LoggerFactory.getLogger(RegistrationConfig::class.java)

    @Bean
    fun identityProvisioner(properties: RegistrationProperties, objectMapper: ObjectMapper): IdentityProvisioner {
        if (properties.configured) {
            return KeycloakIdentityProvisioner(properties, objectMapper)
        }
        if (properties.enabled) {
            log.warn("vereint.registration.enabled=true, aber keycloak-url oder client-secret fehlt; Registrierung deaktiviert")
        }
        return DisabledIdentityProvisioner()
    }
}
