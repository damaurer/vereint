package de.maurer.baseservice.config

import de.maurer.baseservice.crypto.EncryptionProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration

/** Aktiviert die Konfiguration der Anwendungsverschlüsselung ([EncryptionProperties]). */
@Configuration
@EnableConfigurationProperties(EncryptionProperties::class)
class EncryptionConfig
