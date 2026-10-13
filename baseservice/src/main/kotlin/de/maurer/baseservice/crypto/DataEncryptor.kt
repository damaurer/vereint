package de.maurer.baseservice.crypto

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.GeneralSecurityException
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Verschlüsselt Inhalte mit AES-256-GCM, bevor sie in PostgreSQL oder S3
 * landen. Ein geleakter Datenbank-Dump oder Bucket-Inhalt ist ohne den
 * Schlüssel unlesbar; GCM erkennt zusätzlich jede Manipulation.
 *
 * Binärformat: `MAGIC (4) | Schlüssel-ID (4) | IV (12) | Chiffretext + Tag`.
 * Die Schlüssel-ID sind die ersten vier Bytes des SHA-256 über den Schlüssel;
 * damit lassen sich nach einer Rotation auch Daten des Vorgängerschlüssels
 * lesen. Texte werden als `enc:v1:` + Base64 des Binärformats gespeichert.
 *
 * Daten ohne Kennung (vor Einführung der Verschlüsselung gespeichert) werden
 * unverändert zurückgegeben und beim nächsten Schreiben verschlüsselt.
 */
@Component
class DataEncryptor(properties: EncryptionProperties) {

    private val log = LoggerFactory.getLogger(DataEncryptor::class.java)
    private val random = SecureRandom()

    private val currentKey: KeyEntry?
    private val keysById: Map<ByteBuffer, KeyEntry>

    init {
        val current = parseKey(properties.key, "DATA_ENCRYPTION_KEY")
        val previous = parseKey(properties.previousKey, "DATA_ENCRYPTION_KEY_PREVIOUS")
        if (properties.enabled && current == null) {
            throw IllegalStateException("vereint.encryption.enabled=true, aber DATA_ENCRYPTION_KEY fehlt")
        }
        currentKey = if (properties.enabled) current else null
        keysById = listOfNotNull(current, previous).associateBy { ByteBuffer.wrap(it.id) }
        if (currentKey == null) {
            log.warn("Anwendungsverschlüsselung ist deaktiviert; Inhalte werden im Klartext gespeichert")
        }
    }

    /** `true`, wenn neue Inhalte verschlüsselt geschrieben werden. */
    val enabled: Boolean get() = currentKey != null

    fun encrypt(plain: ByteArray): ByteArray {
        val key = currentKey ?: return plain
        val iv = ByteArray(IV_LENGTH).also(random::nextBytes)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key.secret, GCMParameterSpec(TAG_BITS, iv))
        cipher.updateAAD(MAGIC)
        val sealed = cipher.doFinal(plain)
        return ByteBuffer.allocate(HEADER_LENGTH + sealed.size)
            .put(MAGIC).put(key.id).put(iv).put(sealed)
            .array()
    }

    fun decrypt(data: ByteArray): ByteArray {
        if (!isEncrypted(data)) return data
        val keyId = ByteBuffer.wrap(data, MAGIC.size, KEY_ID_LENGTH).slice()
        val key = keysById[keyId]
            ?: throw DecryptionException("Kein passender Schlüssel für verschlüsselte Daten konfiguriert")
        val iv = data.copyOfRange(MAGIC.size + KEY_ID_LENGTH, HEADER_LENGTH)
        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key.secret, GCMParameterSpec(TAG_BITS, iv))
            cipher.updateAAD(MAGIC)
            cipher.doFinal(data, HEADER_LENGTH, data.size - HEADER_LENGTH)
        } catch (e: GeneralSecurityException) {
            throw DecryptionException("Verschlüsselte Daten sind beschädigt oder wurden verändert", e)
        }
    }

    fun encryptText(plain: String?): String? {
        if (plain == null || !enabled) return plain
        return TEXT_PREFIX + Base64.getEncoder().encodeToString(encrypt(plain.toByteArray(StandardCharsets.UTF_8)))
    }

    fun decryptText(stored: String?): String? {
        if (stored == null || !stored.startsWith(TEXT_PREFIX)) return stored
        val data = try {
            Base64.getDecoder().decode(stored.substring(TEXT_PREFIX.length))
        } catch (e: IllegalArgumentException) {
            throw DecryptionException("Verschlüsselter Text ist kein gültiges Base64", e)
        }
        if (!isEncrypted(data)) throw DecryptionException("Verschlüsselter Text hat ein unbekanntes Format")
        return String(decrypt(data), StandardCharsets.UTF_8)
    }

    fun isEncrypted(data: ByteArray): Boolean =
        data.size > HEADER_LENGTH && MAGIC.indices.all { data[it] == MAGIC[it] }

    private class KeyEntry(val secret: SecretKey, val id: ByteArray)

    private fun parseKey(value: String, name: String): KeyEntry? {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return null
        val bytes = try {
            Base64.getDecoder().decode(trimmed)
        } catch (e: IllegalArgumentException) {
            throw IllegalStateException("$name ist kein gültiges Base64", e)
        }
        check(bytes.size == KEY_LENGTH) { "$name muss genau $KEY_LENGTH Byte (256 Bit) lang sein" }
        val id = MessageDigest.getInstance("SHA-256").digest(bytes).copyOf(KEY_ID_LENGTH)
        return KeyEntry(SecretKeySpec(bytes, "AES"), id)
    }

    companion object {
        const val TEXT_PREFIX = "enc:v1:"
        private val MAGIC = byteArrayOf(0x56, 0x45, 0x4E, 0x31) // "VEN1"
        private const val KEY_LENGTH = 32
        private const val KEY_ID_LENGTH = 4
        private const val IV_LENGTH = 12
        private const val TAG_BITS = 128
        private const val HEADER_LENGTH = 4 + KEY_ID_LENGTH + IV_LENGTH
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}

class DecryptionException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)
