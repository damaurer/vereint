package de.maurer.baseservice.push

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import java.math.BigInteger
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPrivateKeySpec
import java.time.Duration
import java.time.Instant
import java.util.Base64

/**
 * Web-Push-Versand über VAPID (RFC 8292) ohne verschlüsselte Nutzlast (TICKET-020).
 *
 * Der Sender authentifiziert sich beim Push-Dienst mit einem ES256-signierten
 * VAPID-Token. Eine Nutzlast wird bewusst nicht übertragen: die eigentlichen
 * Inhalte liegen geschützt in `notifications` und werden vom Client autorisiert
 * nachgeladen. So bleiben private Daten aus dem Push-Kanal fern und es ist keine
 * RFC-8291-Verschlüsselung nötig.
 *
 * Der private VAPID-Schlüssel ist ein Secret und verlässt den Spring-Service
 * nicht; nur der öffentliche Schlüssel wird über den [PushSender.publicKey] an
 * berechtigte Clients ausgeliefert.
 */
class VapidPushSender(
    private val properties: PushProperties,
    private val objectMapper: ObjectMapper,
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build()
) : PushSender {

    private val log = LoggerFactory.getLogger(VapidPushSender::class.java)
    private val urlEncoder: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()
    private val urlDecoder: Base64.Decoder = Base64.getUrlDecoder()

    override fun isEnabled(): Boolean = properties.isConfigured()

    override fun publicKey(): String = properties.publicKey

    override fun send(target: PushTarget, message: PushMessage): PushDeliveryResult {
        return try {
            val token = buildVapidToken(target.endpoint)
            val request = HttpRequest.newBuilder()
                .uri(URI.create(target.endpoint))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "vapid t=$token, k=${properties.publicKey}")
                .header("TTL", ttlSeconds().toString())
                .header("Content-Length", "0")
                .POST(HttpRequest.BodyPublishers.noBody())
                .build()

            val response = httpClient.send(request, HttpResponse.BodyHandlers.discarding())
            val status = response.statusCode()
            when {
                status in 200..299 ->
                    PushDeliveryResult(target.subscriptionId, success = true, statusCode = status)
                status == 404 || status == 410 ->
                    PushDeliveryResult(target.subscriptionId, success = false, statusCode = status, gone = true)
                else -> {
                    log.warn("push delivery failed subscription={} status={}", target.subscriptionId, status)
                    PushDeliveryResult(target.subscriptionId, success = false, statusCode = status)
                }
            }
        } catch (ex: Exception) {
            log.warn("push delivery error subscription={}: {}", target.subscriptionId, ex.message)
            PushDeliveryResult(target.subscriptionId, success = false, error = ex.javaClass.simpleName)
        }
    }

    private fun ttlSeconds(): Long = properties.ttlSeconds.coerceIn(0, MAX_TTL_SECONDS)

    /**
     * Erzeugt ein ES256-signiertes VAPID-Token für den Ursprung des Endpoints.
     */
    internal fun buildVapidToken(endpoint: String, now: Instant = Instant.now()): String {
        val audience = originOf(endpoint)
        val headerJson = objectMapper.writeValueAsString(mapOf("typ" to "JWT", "alg" to "ES256"))
        val payloadJson = objectMapper.writeValueAsString(
            mapOf(
                "aud" to audience,
                "exp" to now.plus(Duration.ofHours(12)).epochSecond,
                "sub" to properties.subject
            )
        )
        val signingInput = "${encode(headerJson.toByteArray())}.${encode(payloadJson.toByteArray())}"
        val signature = signEs256(signingInput.toByteArray())
        return "$signingInput.${urlEncoder.encodeToString(signature)}"
    }

    private fun encode(bytes: ByteArray): String = urlEncoder.encodeToString(bytes)

    private fun signEs256(data: ByteArray): ByteArray {
        val parameters = AlgorithmParameters.getInstance("EC").apply {
            init(ECGenParameterSpec("secp256r1"))
        }
        val ecSpec = parameters.getParameterSpec(ECParameterSpec::class.java)
        val scalar = BigInteger(1, urlDecoder.decode(properties.privateKey))
        val privateKey = KeyFactory.getInstance("EC")
            .generatePrivate(ECPrivateKeySpec(scalar, ecSpec))

        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(privateKey)
        signer.update(data)
        return derToJose(signer.sign())
    }

    /**
     * Wandelt eine DER-kodierte ECDSA-Signatur in das für JWS erwartete
     * feste `R || S`-Format (je 32 Byte) um.
     */
    internal fun derToJose(der: ByteArray): ByteArray {
        // DER: 0x30 len 0x02 rLen R 0x02 sLen S
        var offset = 3
        if (der[1].toInt() and 0xFF and 0x80 != 0) {
            // Länge in Langform (mehr als 127 Byte); bei P-256 nicht zu erwarten.
            offset = 3 + (der[1].toInt() and 0x7F)
        }
        val rLength = der[offset].toInt()
        val rStart = offset + 1
        val sLength = der[rStart + rLength + 1].toInt()
        val sStart = rStart + rLength + 2

        val r = trimToComponent(der.copyOfRange(rStart, rStart + rLength))
        val s = trimToComponent(der.copyOfRange(sStart, sStart + sLength))

        val jose = ByteArray(COMPONENT_LENGTH * 2)
        System.arraycopy(r, 0, jose, COMPONENT_LENGTH - r.size, r.size)
        System.arraycopy(s, 0, jose, COMPONENT_LENGTH * 2 - s.size, s.size)
        return jose
    }

    /** Entfernt ein führendes Vorzeichen-Nullbyte und begrenzt auf 32 Byte. */
    private fun trimToComponent(component: ByteArray): ByteArray {
        var value = component
        if (value.size > COMPONENT_LENGTH) {
            value = value.copyOfRange(value.size - COMPONENT_LENGTH, value.size)
        }
        return value
    }

    /** Liefert `scheme://host[:port]` des Endpoints als VAPID-Audience. */
    internal fun originOf(endpoint: String): String {
        val uri = URI.create(endpoint)
        val port = if (uri.port == -1) "" else ":${uri.port}"
        return "${uri.scheme}://${uri.host}$port"
    }

    companion object {
        private const val COMPONENT_LENGTH = 32
        private const val MAX_TTL_SECONDS = 2_419_200L
    }
}
