package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import com.sun.net.httpserver.HttpServer
import de.maurer.baseservice.push.PushMessage
import de.maurer.baseservice.push.PushProperties
import de.maurer.baseservice.push.PushTarget
import de.maurer.baseservice.push.VapidKeys
import de.maurer.baseservice.push.VapidPushSender
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.math.BigInteger
import java.net.InetAddress
import java.net.InetSocketAddress
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.Base64

/**
 * Prüft den VAPID-Sender ohne Netzwerkzugriff: Schlüsselaufbereitung,
 * ES256-Signatur, DER→JOSE-Konvertierung und Audience-Ableitung (TICKET-020).
 */
class VapidPushSenderTest {

    private val objectMapper = ObjectMapper()
    private val urlEncoder = Base64.getUrlEncoder().withoutPadding()
    private val urlDecoder = Base64.getUrlDecoder()

    @Test
    fun `builds a verifiable ES256 vapid token`() {
        val generator = KeyPairGenerator.getInstance("EC").apply {
            initialize(ECGenParameterSpec("secp256r1"))
        }
        val keyPair = generator.generateKeyPair()
        val privateKey = keyPair.private as ECPrivateKey
        val publicKey = keyPair.public as ECPublicKey

        val properties = PushProperties(
            enabled = true,
            subject = "mailto:betreiber@example.org",
            publicKey = urlEncoder.encodeToString(encodePublicPoint(publicKey)),
            privateKey = urlEncoder.encodeToString(toFixedLength(privateKey.s.toByteArray(), 32))
        )
        val sender = VapidPushSender(properties, objectMapper)

        assertTrue(sender.isEnabled())

        val token = sender.buildVapidToken("https://fcm.googleapis.com/fcm/send/abc123")
        val parts = token.split(".")
        assertEquals(3, parts.size)

        val signingInput = "${parts[0]}.${parts[1]}"
        val jose = urlDecoder.decode(parts[2])
        assertEquals(64, jose.size)

        val verifier = Signature.getInstance("SHA256withECDSA")
        verifier.initVerify(publicKey)
        verifier.update(signingInput.toByteArray())
        assertTrue(verifier.verify(joseToDer(jose)), "VAPID-Signatur muss mit dem öffentlichen Schlüssel prüfbar sein")

        val payloadJson = String(urlDecoder.decode(parts[1]))
        assertTrue(payloadJson.contains("\"aud\":\"https://fcm.googleapis.com\""))
        assertTrue(payloadJson.contains("\"sub\":\"mailto:betreiber@example.org\""))
    }

    @Test
    fun `derives the origin without a port`() {
        val sender = VapidPushSender(PushProperties(), objectMapper)
        assertEquals(
            "https://updates.push.services.mozilla.com",
            sender.originOf("https://updates.push.services.mozilla.com/wpush/v2/abcd")
        )
    }

    @Test
    fun `posts an empty vapid request and maps the push service status`() {
        val keyPair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }
            .generateKeyPair()
        val properties = PushProperties(
            enabled = true,
            subject = "mailto:betreiber@example.org",
            publicKey = urlEncoder.encodeToString(encodePublicPoint(keyPair.public as ECPublicKey)),
            privateKey = urlEncoder.encodeToString(toFixedLength((keyPair.private as ECPrivateKey).s.toByteArray(), 32)),
            ttlSeconds = 60
        )
        val received = mutableListOf<Map<String, String?>>()
        val server = HttpServer.create(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0)
        server.createContext("/") { exchange ->
            received += mapOf(
                "method" to exchange.requestMethod,
                "authorization" to exchange.requestHeaders.getFirst("Authorization"),
                "ttl" to exchange.requestHeaders.getFirst("TTL"),
                "length" to exchange.requestHeaders.getFirst("Content-Length")
            )
            val status = if (exchange.requestURI.path.endsWith("gone")) 410 else 201
            exchange.sendResponseHeaders(status, -1)
            exchange.close()
        }
        server.start()
        try {
            val base = "http://127.0.0.1:${server.address.port}"
            val sender = VapidPushSender(properties, objectMapper)

            val ok = sender.send(PushTarget("s1", "$base/live", "p", "a"), PushMessage("t", "b", "general"))
            val gone = sender.send(PushTarget("s2", "$base/gone", "p", "a"), PushMessage("t", "b", "general"))

            assertTrue(ok.success, "Zustellung muss gelingen: ${ok.error}")
            assertEquals(201, ok.statusCode)
            assertFalse(gone.success)
            assertTrue(gone.gone)
            assertEquals("POST", received[0]["method"])
            assertEquals("60", received[0]["ttl"])
            assertEquals("0", received[0]["length"])
            assertTrue(received[0]["authorization"]!!.startsWith("vapid t="))
            assertTrue(received[0]["authorization"]!!.endsWith("k=${properties.publicKey}"))
        } finally {
            server.stop(0)
        }
    }

    @Test
    fun `normalizes der and pem keys as generated by terraform`() {
        val keyPair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }
            .generateKeyPair()
        val publicKey = keyPair.public as ECPublicKey
        val privateKey = keyPair.private as ECPrivateKey
        val rawPublic = urlEncoder.encodeToString(encodePublicPoint(publicKey))
        val rawPrivate = urlEncoder.encodeToString(toFixedLength(privateKey.s.toByteArray(), 32))
        val mime = Base64.getMimeEncoder(64, "\n".toByteArray())

        val spkiBase64 = Base64.getEncoder().encodeToString(publicKey.encoded)
        val pkcs8Pem = "-----BEGIN PRIVATE KEY-----\n${mime.encodeToString(privateKey.encoded)}\n-----END PRIVATE KEY-----\n"

        assertEquals(rawPublic, VapidKeys.normalizePublicKey(spkiBase64))
        assertEquals(rawPrivate, VapidKeys.normalizePrivateKey(pkcs8Pem))
        assertEquals(rawPrivate, VapidKeys.normalizePrivateKey(Base64.getEncoder().encodeToString(privateKey.encoded)))
        // Bereits passende Werte bleiben unverändert.
        assertEquals(rawPublic, VapidKeys.normalizePublicKey(rawPublic))
        assertEquals(rawPrivate, VapidKeys.normalizePrivateKey(rawPrivate))
        assertEquals("", VapidKeys.normalizePublicKey(""))
    }

    private fun encodePublicPoint(publicKey: ECPublicKey): ByteArray {
        val x = toFixedLength(publicKey.w.affineX.toByteArray(), 32)
        val y = toFixedLength(publicKey.w.affineY.toByteArray(), 32)
        val point = ByteArray(65)
        point[0] = 0x04
        System.arraycopy(x, 0, point, 1, 32)
        System.arraycopy(y, 0, point, 33, 32)
        return point
    }

    private fun toFixedLength(value: ByteArray, length: Int): ByteArray {
        if (value.size == length) return value
        val result = ByteArray(length)
        if (value.size > length) {
            System.arraycopy(value, value.size - length, result, 0, length)
        } else {
            System.arraycopy(value, 0, result, length - value.size, value.size)
        }
        return result
    }

    /** Wandelt eine feste `R || S`-Signatur (64 Byte) in DER für die Verifikation. */
    private fun joseToDer(jose: ByteArray): ByteArray {
        val r = BigInteger(1, jose.copyOfRange(0, 32))
        val s = BigInteger(1, jose.copyOfRange(32, 64))
        val rBytes = r.toByteArray()
        val sBytes = s.toByteArray()
        val total = 2 + rBytes.size + 2 + sBytes.size
        val der = ByteArray(2 + total)
        var i = 0
        der[i++] = 0x30
        der[i++] = total.toByte()
        der[i++] = 0x02
        der[i++] = rBytes.size.toByte()
        System.arraycopy(rBytes, 0, der, i, rBytes.size)
        i += rBytes.size
        der[i++] = 0x02
        der[i++] = sBytes.size.toByte()
        System.arraycopy(sBytes, 0, der, i, sBytes.size)
        return der
    }
}
