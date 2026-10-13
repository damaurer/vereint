package de.maurer.baseservice.crypto

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Konfiguration der Anwendungsverschlüsselung für Chat-Nachrichten,
 * Benachrichtigungen und Bilddateien.
 *
 * [key] und [previousKey] sind Base64-kodierte 256-Bit-Schlüssel aus
 * `DATA_ENCRYPTION_KEY` bzw. `DATA_ENCRYPTION_KEY_PREVIOUS`. In Produktion
 * stammen sie aus dem AWS SSM Parameter Store und gelangen nie in Browser,
 * SSR-HTML oder Logs. Ist [enabled] gesetzt, startet der Service ohne gültigen
 * Schlüssel nicht (`deny by default`).
 */
@ConfigurationProperties(prefix = "vereint.encryption")
data class EncryptionProperties(
    val enabled: Boolean = false,
    val key: String = "",
    /** Vorgängerschlüssel für die Rotation: wird nur noch zum Entschlüsseln genutzt. */
    val previousKey: String = ""
)
