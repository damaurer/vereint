package de.maurer.baseservice.storage

import org.slf4j.LoggerFactory
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * S3-/MinIO-Anbindung über AWS Signature Version 4 (TICKET-014).
 *
 * Die Implementierung kommt ohne zusätzliche SDK-Abhängigkeit aus: Schreiben und
 * Löschen laufen über kurzlebige, signierte URLs und den JDK-`HttpClient`, der
 * lesende Zugriff über eine presignte GET-URL ([presignedGetUrl]). Dauerhafte
 * Zugangsdaten verlassen den Server dadurch nie. Pfad-Stil-Zugriff
 * (`endpoint/bucket/key`) ist für MinIO der robuste Standard.
 */
class S3ObjectStorage(
    private val properties: StorageProperties,
    private val httpClient: HttpClient = HttpClient.newHttpClient()
) : ObjectStorage {

    private val log = LoggerFactory.getLogger(S3ObjectStorage::class.java)
    private val endpoint: URI = URI.create(properties.endpoint.trimEnd('/'))

    override fun store(key: String, data: ByteArray, contentType: String) {
        val url = presign("PUT", key, properties.urlTtl())
        val request = HttpRequest.newBuilder(url)
            .header("Content-Type", contentType)
            .PUT(HttpRequest.BodyPublishers.ofByteArray(data))
            .build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        if (response.statusCode() !in 200..299) {
            throw ObjectStorageException("Ablegen von '$key' fehlgeschlagen (HTTP ${response.statusCode()})")
        }
    }

    override fun read(key: String): ByteArray? {
        val url = presign("GET", key, properties.urlTtl())
        val request = HttpRequest.newBuilder(url).GET().build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray())
        return when (response.statusCode()) {
            in 200..299 -> response.body()
            404 -> null
            else -> throw ObjectStorageException("Lesen von '$key' fehlgeschlagen (HTTP ${response.statusCode()})")
        }
    }

    override fun delete(key: String) {
        val url = presign("DELETE", key, properties.urlTtl())
        val request = HttpRequest.newBuilder(url).DELETE().build()
        val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        // 204 (gelöscht) und 404 (bereits fort) gelten beide als Erfolg.
        if (response.statusCode() !in 200..299 && response.statusCode() != 404) {
            log.warn("Löschen von '{}' lieferte HTTP {}", key, response.statusCode())
        }
    }

    override fun presignedGetUrl(key: String, ttl: Duration): URI = presign("GET", key, ttl)

    /**
     * Erzeugt eine SigV4-presignte URL (Query-Authentifizierung) für [method] und
     * [key]. Signiert wird ausschließlich der `host`-Header; der Payload bleibt
     * `UNSIGNED-PAYLOAD`.
     */
    private fun presign(method: String, key: String, ttl: Duration): URI {
        val now = Instant.now()
        val amzDate = AMZ_DATE.format(now.atOffset(ZoneOffset.UTC))
        val dateStamp = DATE_STAMP.format(now.atOffset(ZoneOffset.UTC))
        val host = endpoint.authority
        val scheme = endpoint.scheme

        val canonicalUri = canonicalUri(key)
        val credentialScope = "$dateStamp/${properties.region}/$S3_SERVICE/$AWS4_REQUEST"
        val expires = ttl.seconds.coerceIn(StorageProperties.MIN_TTL_SECONDS, StorageProperties.MAX_TTL_SECONDS)

        val queryParams = sortedMapOf(
            "X-Amz-Algorithm" to ALGORITHM,
            "X-Amz-Credential" to "${properties.accessKey}/$credentialScope",
            "X-Amz-Date" to amzDate,
            "X-Amz-Expires" to expires.toString(),
            "X-Amz-SignedHeaders" to SIGNED_HEADERS
        )
        val canonicalQuery = queryParams.entries.joinToString("&") { (k, v) ->
            "${rfc3986(k)}=${rfc3986(v)}"
        }

        val canonicalHeaders = "host:$host\n"
        val canonicalRequest = listOf(
            method,
            canonicalUri,
            canonicalQuery,
            canonicalHeaders,
            SIGNED_HEADERS,
            UNSIGNED_PAYLOAD
        ).joinToString("\n")

        val stringToSign = listOf(
            ALGORITHM,
            amzDate,
            credentialScope,
            hex(sha256(canonicalRequest.toByteArray(StandardCharsets.UTF_8)))
        ).joinToString("\n")

        val signingKey = signingKey(dateStamp)
        val signature = hex(hmacSha256(signingKey, stringToSign))

        return URI.create("$scheme://$host$canonicalUri?$canonicalQuery&X-Amz-Signature=$signature")
    }

    private fun canonicalUri(key: String): String {
        val encodedKey = key.split("/").joinToString("/") { rfc3986(it) }
        return if (properties.pathStyleAccess) {
            "/${rfc3986(properties.bucket)}/$encodedKey"
        } else {
            "/$encodedKey"
        }
    }

    private fun signingKey(dateStamp: String): ByteArray {
        val kDate = hmacSha256("AWS4${properties.secretKey}".toByteArray(StandardCharsets.UTF_8), dateStamp)
        val kRegion = hmacSha256(kDate, properties.region)
        val kService = hmacSha256(kRegion, S3_SERVICE)
        return hmacSha256(kService, AWS4_REQUEST)
    }

    private fun hmacSha256(key: ByteArray, data: String): ByteArray {
        val mac = Mac.getInstance(HMAC_SHA256)
        mac.init(SecretKeySpec(key, HMAC_SHA256))
        return mac.doFinal(data.toByteArray(StandardCharsets.UTF_8))
    }

    private fun sha256(data: ByteArray): ByteArray =
        MessageDigest.getInstance("SHA-256").digest(data)

    private fun hex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }

    /** RFC-3986-konforme Kodierung, wie sie AWS SigV4 verlangt. */
    private fun rfc3986(value: String): String {
        val builder = StringBuilder()
        for (byte in value.toByteArray(StandardCharsets.UTF_8)) {
            val ch = byte.toInt() and 0xFF
            if (ch in 'A'.code..'Z'.code || ch in 'a'.code..'z'.code || ch in '0'.code..'9'.code ||
                ch == '-'.code || ch == '_'.code || ch == '.'.code || ch == '~'.code
            ) {
                builder.append(ch.toChar())
            } else {
                builder.append("%%%02X".format(ch))
            }
        }
        return builder.toString()
    }

    companion object {
        private const val ALGORITHM = "AWS4-HMAC-SHA256"
        private const val S3_SERVICE = "s3"
        private const val AWS4_REQUEST = "aws4_request"
        private const val SIGNED_HEADERS = "host"
        private const val UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD"
        private const val HMAC_SHA256 = "HmacSHA256"
        private val AMZ_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'")
        private val DATE_STAMP: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyyMMdd")
    }
}

class ObjectStorageException(message: String) : RuntimeException(message)
