package de.maurer.baseservice.push

import java.math.BigInteger
import java.nio.ByteBuffer
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Verschlüsselt eine Web-Push-Nutzlast nach RFC 8291 (`aes128gcm`, RFC 8188).
 *
 * Für jede Nachricht entsteht ein frisches P-256-Schlüsselpaar. Aus dem
 * Diffie-Hellman-Geheimnis mit dem Geräteschlüssel (`p256dh`) und dem
 * Authentifizierungsgeheimnis (`auth`) des Abonnements werden Inhaltsschlüssel
 * und Nonce abgeleitet. Nur der Browser, der das Abonnement angelegt hat, kann
 * den Inhalt lesen; der Push-Dienst sieht nur Chiffretext.
 */
object WebPushEncryption {

    private const val RECORD_SIZE = 4096
    private const val POINT_LENGTH = 65
    private const val COMPONENT_LENGTH = 32
    private const val SALT_LENGTH = 16
    private const val TAG_BITS = 128

    private val random = SecureRandom()
    private val decoder: Base64.Decoder = Base64.getUrlDecoder()

    private val curve: ECParameterSpec by lazy {
        AlgorithmParameters.getInstance("EC").apply { init(ECGenParameterSpec("secp256r1")) }
            .getParameterSpec(ECParameterSpec::class.java)
    }

    /** Liefert den fertigen Anfragekörper: Kopf (Salt, Datensatzgröße, Absenderschlüssel) und Chiffretext. */
    fun encrypt(plaintext: ByteArray, p256dh: String, auth: String): ByteArray {
        val generator = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1"), random) }
        val salt = ByteArray(SALT_LENGTH).also(random::nextBytes)
        return encrypt(plaintext, decodeKey(p256dh), decodeKey(auth), generator.generateKeyPair(), salt)
    }

    internal fun encrypt(
        plaintext: ByteArray,
        uaPublic: ByteArray,
        authSecret: ByteArray,
        senderKeys: java.security.KeyPair,
        salt: ByteArray
    ): ByteArray {
        require(uaPublic.size == POINT_LENGTH && uaPublic[0].toInt() == 0x04) { "p256dh is not an uncompressed P-256 point" }
        require(authSecret.size >= 16) { "auth secret too short" }
        require(plaintext.size + 1 + TAG_BITS / 8 <= RECORD_SIZE) { "payload too large" }

        val asPublic = encodePoint(senderKeys.public as ECPublicKey)
        val agreement = KeyAgreement.getInstance("ECDH").apply {
            init(senderKeys.private)
            doPhase(publicKeyOf(uaPublic), true)
        }
        val ecdhSecret = agreement.generateSecret()

        // RFC 8291, Abschnitt 3.4
        val prkKey = hmac(authSecret, ecdhSecret)
        val keyInfo = "WebPush: info\u0000".toByteArray() + uaPublic + asPublic
        val ikm = hmac(prkKey, keyInfo + 0x01)
        val prk = hmac(salt, ikm)
        val cek = hmac(prk, "Content-Encoding: aes128gcm\u0000".toByteArray() + 0x01).copyOf(16)
        val nonce = hmac(prk, "Content-Encoding: nonce\u0000".toByteArray() + 0x01).copyOf(12)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.ENCRYPT_MODE, SecretKeySpec(cek, "AES"), GCMParameterSpec(TAG_BITS, nonce))
        }
        // Ein einziger Datensatz: Klartext plus Trennbyte 0x02 (letzter Datensatz).
        val ciphertext = cipher.doFinal(plaintext + 0x02)

        return ByteBuffer.allocate(SALT_LENGTH + 4 + 1 + asPublic.size + ciphertext.size)
            .put(salt)
            .putInt(RECORD_SIZE)
            .put(asPublic.size.toByte())
            .put(asPublic)
            .put(ciphertext)
            .array()
    }

    internal fun decodeKey(value: String): ByteArray =
        decoder.decode(value.trim().trimEnd('=').replace('+', '-').replace('/', '_'))

    internal fun hmac(key: ByteArray, data: ByteArray): ByteArray =
        Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(data)

    internal fun publicKeyOf(point: ByteArray): ECPublicKey {
        val x = BigInteger(1, point.copyOfRange(1, 1 + COMPONENT_LENGTH))
        val y = BigInteger(1, point.copyOfRange(1 + COMPONENT_LENGTH, POINT_LENGTH))
        return KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(ECPoint(x, y), curve)) as ECPublicKey
    }

    internal fun encodePoint(key: ECPublicKey): ByteArray {
        val point = ByteArray(POINT_LENGTH)
        point[0] = 0x04
        fixed(key.w.affineX).copyInto(point, 1)
        fixed(key.w.affineY).copyInto(point, 1 + COMPONENT_LENGTH)
        return point
    }

    private fun fixed(value: BigInteger): ByteArray {
        val raw = value.toByteArray()
        return when {
            raw.size == COMPONENT_LENGTH -> raw
            raw.size > COMPONENT_LENGTH -> raw.copyOfRange(raw.size - COMPONENT_LENGTH, raw.size)
            else -> ByteArray(COMPONENT_LENGTH - raw.size) + raw
        }
    }

    private operator fun ByteArray.plus(byte: Int): ByteArray = this + byteArrayOf(byte.toByte())
}
