package de.maurer.baseservice

import de.maurer.baseservice.push.WebPushEncryption
import java.nio.ByteBuffer
import java.security.KeyPair
import java.security.interfaces.ECPublicKey
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Empfängerseite von RFC 8291, wie sie ein Browser ausführt; nur für Tests. */
object WebPushTestDecryption {

    fun decrypt(body: ByteArray, device: KeyPair, authSecret: ByteArray): String {
        val buffer = ByteBuffer.wrap(body)
        val salt = ByteArray(16).also { buffer.get(it) }
        buffer.int // Datensatzgröße
        val asPublic = ByteArray(buffer.get().toInt()).also { buffer.get(it) }
        val ciphertext = ByteArray(buffer.remaining()).also { buffer.get(it) }

        val uaPublic = WebPushEncryption.encodePoint(device.public as ECPublicKey)
        val ecdh = KeyAgreement.getInstance("ECDH").apply {
            init(device.private)
            doPhase(WebPushEncryption.publicKeyOf(asPublic), true)
        }.generateSecret()

        val prkKey = WebPushEncryption.hmac(authSecret, ecdh)
        val ikm = WebPushEncryption.hmac(prkKey, "WebPush: info\u0000".toByteArray() + uaPublic + asPublic + byteArrayOf(1))
        val prk = WebPushEncryption.hmac(salt, ikm)
        val cek = WebPushEncryption.hmac(prk, "Content-Encoding: aes128gcm\u0000".toByteArray() + byteArrayOf(1)).copyOf(16)
        val nonce = WebPushEncryption.hmac(prk, "Content-Encoding: nonce\u0000".toByteArray() + byteArrayOf(1)).copyOf(12)

        val plain = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, SecretKeySpec(cek, "AES"), GCMParameterSpec(128, nonce))
        }.doFinal(ciphertext)
        check(plain.last() == 0x02.toByte()) { "missing last-record delimiter" }
        return String(plain, 0, plain.size - 1)
    }
}
