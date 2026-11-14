package de.maurer.baseservice.support

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * Erzeugung und Hashing von Geheimnistoken (Magic-Link- und Gast-Token).
 *
 * Der Rohwert eines Tokens wird nur einmalig an den Aufrufer zurückgegeben und
 * niemals persistiert; in der Datenbank liegt ausschließlich der SHA-256-Hash
 * in hexadezimaler Kleinschreibung. Das Hashformat ist deckungsgleich mit der
 * Prüfung in `AccessResolverService`, damit ein ausgegebenes Gast-Token beim
 * Zugriff wiedergefunden wird.
 */
object SecureTokens {

    private val secureRandom = SecureRandom()
    private val urlEncoder = Base64.getUrlEncoder().withoutPadding()

    /** Kryptografisch sicheres, URL-taugliches Token (Standard 32 Byte Entropie). */
    fun generateToken(byteLength: Int = 32): String {
        val bytes = ByteArray(byteLength)
        secureRandom.nextBytes(bytes)
        return urlEncoder.encodeToString(bytes)
    }

    /** SHA-256-Hash in hexadezimaler Kleinschreibung (64 Zeichen). */
    fun sha256Hex(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}
