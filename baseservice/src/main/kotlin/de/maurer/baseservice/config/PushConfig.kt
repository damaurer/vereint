package de.maurer.baseservice.config

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.push.NoOpPushSender
import de.maurer.baseservice.push.PushProperties
import de.maurer.baseservice.push.PushSender
import de.maurer.baseservice.push.VapidKeys
import de.maurer.baseservice.push.VapidPushSender
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * Auswahl der Web-Push-Anbindung (TICKET-020).
 *
 * Bei `vereint.push.enabled=true` und vollständig konfigurierten VAPID-Schlüsseln
 * wird der echte [VapidPushSender] verwendet; andernfalls (Tests, lokale Läufe
 * ohne VAPID) greift der [NoOpPushSender], der Benachrichtigungen speichert, aber
 * nicht zustellt.
 */
@Configuration
@EnableConfigurationProperties(PushProperties::class)
class PushConfig {

    @Bean
    @ConditionalOnProperty(prefix = "vereint.push", name = ["enabled"], havingValue = "true")
    fun vapidPushSender(properties: PushProperties, objectMapper: ObjectMapper): PushSender =
        VapidPushSender(
            // Schlüssel dürfen auch DER-kodiert sein (z. B. von openssl); ungültige Werte brechen
            // den Start ab, statt Push still ins Leere laufen zu lassen.
            properties.copy(
                publicKey = VapidKeys.normalizePublicKey(properties.publicKey),
                privateKey = VapidKeys.normalizePrivateKey(properties.privateKey)
            ),
            objectMapper
        )

    @Bean
    @ConditionalOnMissingBean(PushSender::class)
    fun noOpPushSender(properties: PushProperties): PushSender =
        NoOpPushSender(properties.publicKey)
}
