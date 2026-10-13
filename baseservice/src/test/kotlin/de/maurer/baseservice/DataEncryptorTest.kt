package de.maurer.baseservice

import de.maurer.baseservice.crypto.DataEncryptor
import de.maurer.baseservice.crypto.DecryptionException
import de.maurer.baseservice.crypto.EncryptedStringConverter
import de.maurer.baseservice.crypto.EncryptionProperties
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.util.Base64

class DataEncryptorTest {

    private fun key(fill: Int): String = Base64.getEncoder().encodeToString(ByteArray(32) { fill.toByte() })

    private val encryptor = DataEncryptor(EncryptionProperties(enabled = true, key = key(1)))

    @Test
    fun `round-trips bytes and text`() {
        val plain = "Grüße an alle 🍻".toByteArray()
        val sealed = encryptor.encrypt(plain)
        assertTrue(encryptor.isEncrypted(sealed))
        assertFalse(sealed.contentEquals(plain))
        assertArrayEquals(plain, encryptor.decrypt(sealed))

        val text = encryptor.encryptText("Treffen um 19 Uhr")!!
        assertTrue(text.startsWith(DataEncryptor.TEXT_PREFIX))
        assertFalse(text.contains("Treffen"))
        assertEquals("Treffen um 19 Uhr", encryptor.decryptText(text))
    }

    @Test
    fun `uses a fresh IV for every encryption`() {
        assertNotEquals(encryptor.encryptText("gleich"), encryptor.encryptText("gleich"))
    }

    @Test
    fun `passes legacy plaintext and null through`() {
        assertEquals("alte Nachricht", encryptor.decryptText("alte Nachricht"))
        assertNull(encryptor.encryptText(null))
        assertNull(encryptor.decryptText(null))
        val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47)
        assertArrayEquals(png, encryptor.decrypt(png))
    }

    @Test
    fun `detects tampering`() {
        val sealed = encryptor.encrypt("Betrag: 10 EUR".toByteArray())
        sealed[sealed.size - 1] = (sealed[sealed.size - 1].toInt() xor 1).toByte()
        assertThrows(DecryptionException::class.java) { encryptor.decrypt(sealed) }
    }

    @Test
    fun `refuses data encrypted with an unknown key`() {
        val other = DataEncryptor(EncryptionProperties(enabled = true, key = key(2)))
        val sealed = other.encryptText("geheim")
        assertThrows(DecryptionException::class.java) { encryptor.decryptText(sealed) }
    }

    @Test
    fun `reads data of the previous key after rotation`() {
        val old = DataEncryptor(EncryptionProperties(enabled = true, key = key(1)))
        val sealed = old.encryptText("vor der Rotation")
        val rotated = DataEncryptor(EncryptionProperties(enabled = true, key = key(2), previousKey = key(1)))
        assertEquals("vor der Rotation", rotated.decryptText(sealed))
        // Neue Daten werden mit dem neuen Schlüssel geschrieben.
        val fresh = rotated.encryptText("nach der Rotation")
        assertThrows(DecryptionException::class.java) { old.decryptText(fresh) }
    }

    @Test
    fun `fails fast when enabled without a valid key`() {
        assertThrows(IllegalStateException::class.java) { DataEncryptor(EncryptionProperties(enabled = true)) }
        assertThrows(IllegalStateException::class.java) {
            DataEncryptor(EncryptionProperties(enabled = true, key = "kein-base64!"))
        }
        assertThrows(IllegalStateException::class.java) {
            DataEncryptor(EncryptionProperties(enabled = true, key = Base64.getEncoder().encodeToString(ByteArray(16))))
        }
    }

    @Test
    fun `stores plaintext when disabled but still reads encrypted data`() {
        val disabled = DataEncryptor(EncryptionProperties(enabled = false, key = key(1)))
        assertFalse(disabled.enabled)
        assertEquals("klar", disabled.encryptText("klar"))
        assertEquals("verschlüsselt", disabled.decryptText(encryptor.encryptText("verschlüsselt")))
    }

    @Test
    fun `converter encrypts on write and decrypts on read`() {
        val converter = EncryptedStringConverter(encryptor)
        val column = converter.convertToDatabaseColumn("Hallo")!!
        assertTrue(column.startsWith(DataEncryptor.TEXT_PREFIX))
        assertEquals("Hallo", converter.convertToEntityAttribute(column))
    }
}
