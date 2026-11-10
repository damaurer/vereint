package de.maurer.baseservice.push

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Konfiguration des Web-Push-Versands über VAPID (TICKET-020).
 *
 * Die Werte stammen aus den `VAPID_*`-Umgebungsvariablen (siehe
 * `docs/baseservice/06-integrations.md`). Der private Schlüssel ist ein Secret
 * und gelangt ausschließlich in den Spring-Service, niemals in Browser-Bundles
 * oder SSR-HTML; nur der öffentliche Schlüssel wird an berechtigte Clients
 * ausgeliefert.
 *
 * Ist [enabled] `false` (Tests, lokale Läufe ohne VAPID-Schlüssel), wird der
 * [NoOpPushSender] verwendet: Benachrichtigungen werden weiterhin gespeichert,
 * aber nicht tatsächlich zugestellt.
 */
@ConfigurationProperties(prefix = "vereint.push")
data class PushProperties(
    val enabled: Boolean = false,
    /** `mailto:`- oder `https:`-Kontakt des Betreibers für den Push-Dienst. */
    val subject: String = "",
    /** Öffentlicher VAPID-Schlüssel (base64url, unkomprimierter P-256-Punkt). */
    val publicKey: String = "",
    /** Privater VAPID-Schlüssel (base64url, roher P-256-Skalar) – Secret. */
    val privateKey: String = "",
    /** Lebensdauer einer Push-Nachricht beim Push-Dienst in Sekunden. */
    val ttlSeconds: Long = 2_419_200 // 28 Tage (Web-Push-Standardobergrenze)
) {
    fun isConfigured(): Boolean =
        enabled && subject.isNotBlank() && publicKey.isNotBlank() && privateKey.isNotBlank()
}
