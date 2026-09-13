package de.maurer.baseservice.storage

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

/**
 * Konfiguration des S3-kompatiblen Objektspeichers (TICKET-014).
 *
 * Die Werte stammen aus den `S3_*`-Umgebungsvariablen (siehe `docs/deployment.md`).
 * Secrets (`accessKey`, `secretKey`) gelangen ausschließlich in den Spring-Service
 * und niemals in Browser-Bundles oder SSR-HTML. Ist [enabled] `false`, wird ein
 * In-Memory-Speicher verwendet (Tests und lokale Läufe ohne MinIO).
 */
@ConfigurationProperties(prefix = "vereint.storage")
data class StorageProperties(
    val enabled: Boolean = false,
    val endpoint: String = "",
    val bucket: String = "vereint",
    val region: String = "us-east-1",
    val accessKey: String = "",
    val secretKey: String = "",
    /** Pfad-Stil (`endpoint/bucket/key`) ist für MinIO der robuste Standard. */
    val pathStyleAccess: Boolean = true,
    /** Gültigkeitsdauer der privaten, signierten URLs in Sekunden. */
    val urlTtlSeconds: Long = 900
) {
    fun urlTtl(): Duration = Duration.ofSeconds(urlTtlSeconds.coerceIn(MIN_TTL_SECONDS, MAX_TTL_SECONDS))

    companion object {
        const val MIN_TTL_SECONDS = 30L
        const val MAX_TTL_SECONDS = 604_800L // sieben Tage (S3-Obergrenze für presignte URLs)
    }
}
