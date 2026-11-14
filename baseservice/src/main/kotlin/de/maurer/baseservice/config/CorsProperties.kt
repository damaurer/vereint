package de.maurer.baseservice.config

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Explizite CORS-Konfiguration für direkte Browserzugriffe der PWA.
 *
 * Wildcards sind unzulässig; Credentials werden nur für die konfigurierten
 * eigenen Ursprünge erlaubt.
 */
@ConfigurationProperties(prefix = "vereint.cors")
data class CorsProperties(
    val allowedOrigins: List<String> = emptyList(),
    val allowedMethods: List<String> = listOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"),
    val allowedHeaders: List<String> = listOf(
        "Authorization",
        "Content-Type",
        "Accept",
        "X-Request-Id",
        "Idempotency-Key"
    ),
    val exposedHeaders: List<String> = listOf("X-Request-Id"),
    val allowCredentials: Boolean = true,
    val maxAgeSeconds: Long = 1800
) {
    /**
     * Verwirft leere Einträge und Wildcards, damit `*` nicht versehentlich
     * über Umgebungsvariablen konfiguriert werden kann.
     */
    fun sanitizedOrigins(): List<String> =
        allowedOrigins.map { it.trim() }.filter { it.isNotEmpty() && it != "*" }
}
