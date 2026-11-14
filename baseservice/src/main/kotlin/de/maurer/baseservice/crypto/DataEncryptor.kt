package de.maurer.baseservice.crypto

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component
import java.io.IOException
import java.io.InputStream
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
 *
 * Große Dateien (Moment-Videos) nutzen das Stromformat [encryptStream]: Es
 * verschlüsselt in Blöcken zu [STREAM_CHUNK_SIZE] Byte, jeder Block mit eigenem
 * GCM-Tag. So muss eine Datei nie ganz im Speicher liegen, und für
 * HTTP-Range-Anfragen (Videovorschau, Spulen) genügt es, die betroffenen Blöcke
 * zu lesen ([decryptStreamChunks]).
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

    /** Länge des verschlüsselten Stroms für [plainLength] Klartextbytes. */
    fun encryptedStreamLength(plainLength: Long): Long =
        STREAM_HEADER_LENGTH + plainLength + streamChunkCount(plainLength) * TAG_LENGTH

    /** Byte-Position des Blocks [chunkIndex] im verschlüsselten Strom. */
    fun streamChunkOffset(chunkIndex: Long): Long =
        STREAM_HEADER_LENGTH + chunkIndex * (STREAM_CHUNK_SIZE + TAG_LENGTH)

    /**
     * Verschlüsselt [source] blockweise, ohne die Daten ganz zu puffern.
     * Format: `MAGIC_STREAM (4) | Schlüssel-ID (4) | IV (12) | Blöcke`, jeder
     * Block `Chiffretext + Tag`. Die Nonce eines Blocks ist der IV mit dem
     * Blockindex verknüpft; Index und „letzter Block“ gehen als AAD ein, damit
     * Blöcke weder vertauscht noch abgeschnitten werden können.
     *
     * [source] muss genau [plainLength] Byte liefern, sonst bricht das Lesen mit
     * einer [IOException] ab. Ohne aktiven Schlüssel wird [source] unverändert
     * zurückgegeben.
     */
    fun encryptStream(source: InputStream, plainLength: Long): InputStream {
        require(plainLength > 0) { "plainLength muss positiv sein" }
        val key = currentKey ?: return source
        val iv = ByteArray(IV_LENGTH).also(random::nextBytes)
        val header = ByteBuffer.allocate(STREAM_HEADER_LENGTH).put(MAGIC_STREAM).put(key.id).put(iv).array()
        return EncryptingStream(source, plainLength, key, iv, header)
    }

    /**
     * Entschlüsselt die Blöcke [firstChunk] bis [lastChunk] eines mit
     * [encryptStream] geschriebenen Stroms. [header] sind dessen erste
     * [STREAM_HEADER_LENGTH] Byte, [chunks] liefert die verschlüsselten Blöcke ab
     * [streamChunkOffset] von [firstChunk].
     */
    fun decryptStreamChunks(
        header: ByteArray,
        chunks: InputStream,
        plainLength: Long,
        firstChunk: Long,
        lastChunk: Long
    ): InputStream {
        if (header.size < STREAM_HEADER_LENGTH || !MAGIC_STREAM.indices.all { header[it] == MAGIC_STREAM[it] }) {
            throw DecryptionException("Verschlüsselter Datenstrom hat ein unbekanntes Format")
        }
        val keyId = ByteBuffer.wrap(header, MAGIC_STREAM.size, KEY_ID_LENGTH).slice()
        val key = keysById[keyId]
            ?: throw DecryptionException("Kein passender Schlüssel für verschlüsselte Daten konfiguriert")
        val iv = header.copyOfRange(MAGIC_STREAM.size + KEY_ID_LENGTH, STREAM_HEADER_LENGTH)
        return DecryptingStream(chunks, plainLength, key, iv, firstChunk, lastChunk)
    }

    private fun streamChunkCount(plainLength: Long): Long =
        (plainLength + STREAM_CHUNK_SIZE - 1) / STREAM_CHUNK_SIZE

    private fun chunkCipher(mode: Int, key: KeyEntry, iv: ByteArray, index: Long, last: Boolean): Cipher {
        val nonce = iv.copyOf()
        for (i in 0 until 8) {
            val pos = IV_LENGTH - 1 - i
            nonce[pos] = (nonce[pos].toInt() xor (index ushr (8 * i)).toInt()).toByte()
        }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(mode, key.secret, GCMParameterSpec(TAG_BITS, nonce))
        cipher.updateAAD(ByteBuffer.allocate(MAGIC_STREAM.size + 9).put(MAGIC_STREAM).putLong(index).put(if (last) 1 else 0).array())
        return cipher
    }

    /** Liefert erst den Kopf, dann Block für Block den Chiffretext. */
    private inner class EncryptingStream(
        private val source: InputStream,
        private val plainLength: Long,
        private val key: KeyEntry,
        private val iv: ByteArray,
        header: ByteArray
    ) : InputStream() {
        private val chunkCount = streamChunkCount(plainLength)
        private var nextChunk = 0L
        private var buffer: ByteArray = header
        private var pos = 0

        override fun read(): Int {
            val one = ByteArray(1)
            return if (read(one, 0, 1) == -1) -1 else one[0].toInt() and 0xFF
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (len == 0) return 0
            if (pos >= buffer.size && !fill()) return -1
            val n = minOf(len, buffer.size - pos)
            System.arraycopy(buffer, pos, b, off, n)
            pos += n
            return n
        }

        private fun fill(): Boolean {
            if (nextChunk >= chunkCount) {
                if (source.read() != -1) throw IOException("Datenstrom ist länger als angekündigt")
                return false
            }
            val last = nextChunk == chunkCount - 1
            val size = if (last) (plainLength - nextChunk * STREAM_CHUNK_SIZE).toInt() else STREAM_CHUNK_SIZE
            val plain = source.readNBytes(size)
            if (plain.size != size) throw IOException("Datenstrom ist kürzer als angekündigt")
            buffer = chunkCipher(Cipher.ENCRYPT_MODE, key, iv, nextChunk, last).doFinal(plain)
            pos = 0
            nextChunk++
            return true
        }

        override fun close() = source.close()
    }

    /** Entschlüsselt die angeforderten Blöcke und prüft dabei jeden Tag. */
    private inner class DecryptingStream(
        private val chunks: InputStream,
        private val plainLength: Long,
        private val key: KeyEntry,
        private val iv: ByteArray,
        firstChunk: Long,
        private val lastChunk: Long
    ) : InputStream() {
        private val chunkCount = streamChunkCount(plainLength)
        private var nextChunk = firstChunk
        private var buffer = ByteArray(0)
        private var pos = 0

        override fun read(): Int {
            val one = ByteArray(1)
            return if (read(one, 0, 1) == -1) -1 else one[0].toInt() and 0xFF
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (len == 0) return 0
            if (pos >= buffer.size && !fill()) return -1
            val n = minOf(len, buffer.size - pos)
            System.arraycopy(buffer, pos, b, off, n)
            pos += n
            return n
        }

        private fun fill(): Boolean {
            if (nextChunk > lastChunk || nextChunk >= chunkCount) return false
            val last = nextChunk == chunkCount - 1
            val plainSize = if (last) (plainLength - nextChunk * STREAM_CHUNK_SIZE).toInt() else STREAM_CHUNK_SIZE
            val sealed = chunks.readNBytes(plainSize + TAG_LENGTH)
            if (sealed.size != plainSize + TAG_LENGTH) {
                throw DecryptionException("Verschlüsselter Datenstrom ist unvollständig")
            }
            buffer = try {
                chunkCipher(Cipher.DECRYPT_MODE, key, iv, nextChunk, last).doFinal(sealed)
            } catch (e: GeneralSecurityException) {
                throw DecryptionException("Verschlüsselte Daten sind beschädigt oder wurden verändert", e)
            }
            pos = 0
            nextChunk++
            return true
        }

        override fun close() = chunks.close()
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
        /** Blockgröße des Stromformats; klein genug für feine Range-Anfragen. */
        const val STREAM_CHUNK_SIZE = 64 * 1024
        private val MAGIC = byteArrayOf(0x56, 0x45, 0x4E, 0x31) // "VEN1"
        private val MAGIC_STREAM = byteArrayOf(0x56, 0x45, 0x53, 0x31) // "VES1"
        private const val TAG_LENGTH = 16
        private const val KEY_LENGTH = 32
        private const val KEY_ID_LENGTH = 4
        private const val IV_LENGTH = 12
        private const val TAG_BITS = 128
        private const val HEADER_LENGTH = 4 + KEY_ID_LENGTH + IV_LENGTH
        const val STREAM_HEADER_LENGTH = 4 + KEY_ID_LENGTH + IV_LENGTH
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}

class DecryptionException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)
