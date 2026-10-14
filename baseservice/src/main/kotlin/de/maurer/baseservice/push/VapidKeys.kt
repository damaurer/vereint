package de.maurer.baseservice.push

import java.math.BigInteger
import java.security.KeyFactory
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

/**
 * Bringt VAPID-Schlüssel in das Format, das Browser und [VapidPushSender]
 * erwarten: base64url ohne Padding, öffentlich als unkomprimierter P-256-Punkt
 * (65 Byte), privat als roher Skalar (32 Byte).
 *
 * Akzeptiert werden außerdem DER-kodierte Schlüssel (SubjectPublicKeyInfo bzw.
 * PKCS#8) in Base64 oder als PEM. So kann Terraform die Schlüssel mit
 * `tls_private_key` erzeugen, ohne dass jemand sie von Hand umwandeln muss.
 */
object VapidKeys {

    private const val COMPONENT_LENGTH = 32
    private const val POINT_LENGTH = 65

    private val urlEncoder: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()

    fun normalizePublicKey(value: String): String {
        if (value.isBlank()) return value
        val bytes = decode(value)
        if (bytes.size == POINT_LENGTH && bytes[0].toInt() == 0x04) return urlEncoder.encodeToString(bytes)

        val key = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(bytes)) as ECPublicKey
        val point = ByteArray(POINT_LENGTH)
        point[0] = 0x04
        fixed(key.w.affineX).copyInto(point, 1)
        fixed(key.w.affineY).copyInto(point, 1 + COMPONENT_LENGTH)
        return urlEncoder.encodeToString(point)
    }

    fun normalizePrivateKey(value: String): String {
        if (value.isBlank()) return value
        val bytes = decode(value)
        if (bytes.size == COMPONENT_LENGTH) return urlEncoder.encodeToString(bytes)

        val key = KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(bytes)) as ECPrivateKey
        return urlEncoder.encodeToString(fixed(key.s))
    }

    /** Liest base64url, Standard-Base64 oder PEM (Kopf- und Fußzeilen werden entfernt). */
    private fun decode(value: String): ByteArray {
        val body = value
            .replace(Regex("-----[A-Z ]+-----"), "")
            .filterNot { it.isWhitespace() || it == '=' }
            .replace('+', '-')
            .replace('/', '_')
        return Base64.getUrlDecoder().decode(body)
    }

    /** Vorzeichenloser Big-Endian-Wert mit genau 32 Byte. */
    private fun fixed(value: BigInteger): ByteArray {
        val raw = value.toByteArray()
        return when {
            raw.size == COMPONENT_LENGTH -> raw
            raw.size > COMPONENT_LENGTH -> raw.copyOfRange(raw.size - COMPONENT_LENGTH, raw.size)
            else -> ByteArray(COMPONENT_LENGTH - raw.size) + raw
        }
    }
}
