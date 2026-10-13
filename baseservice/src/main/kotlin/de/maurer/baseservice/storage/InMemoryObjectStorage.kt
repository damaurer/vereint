package de.maurer.baseservice.storage

import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * In-Memory-Objektspeicher für Tests und lokale Läufe ohne MinIO (TICKET-014).
 *
 * Die Daten liegen ausschließlich im Prozessspeicher. [presignedGetUrl] liefert
 * eine deterministische, zeitlich begrenzte Pseudo-URL mit Ablaufzeitpunkt,
 * sodass die Fachlogik dieselbe Vertragsform wie beim echten S3-Zugriff erhält.
 */
class InMemoryObjectStorage(
    private val bucket: String = "vereint"
) : ObjectStorage {

    private data class Stored(val data: ByteArray, val contentType: String)

    private val objects = ConcurrentHashMap<String, Stored>()

    override fun store(key: String, data: ByteArray, contentType: String) {
        objects[key] = Stored(data.copyOf(), contentType)
    }

    override fun read(key: String): ByteArray? = objects[key]?.data?.copyOf()

    override fun delete(key: String) {
        objects.remove(key)
    }

    override fun presignedGetUrl(key: String, ttl: Duration): URI {
        val expiresAt = Instant.now().plus(ttl).epochSecond
        val encodedKey = key.split("/").joinToString("/") {
            URLEncoder.encode(it, StandardCharsets.UTF_8).replace("+", "%20")
        }
        return URI.create("memory://$bucket/$encodedKey?expires=$expiresAt")
    }

    /** Nur für Tests: prüft, ob ein Objekt gespeichert ist. */
    fun contains(key: String): Boolean = objects.containsKey(key)
}
