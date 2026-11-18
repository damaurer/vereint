package de.maurer.baseservice

import de.maurer.baseservice.push.WebPushEncryption
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Test
import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPair
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPrivateKeySpec
import java.util.Base64

/** Prüft die Verschlüsselung gegen das Beispiel aus RFC 8291, Anhang A. */
class WebPushEncryptionTest {

    private val decoder = Base64.getUrlDecoder()

    @Test
    fun `matches the rfc 8291 test vector`() {
        val expected = decoder.decode(
            "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6Tlz" +
                "AC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
        )
        val curve = AlgorithmParameters.getInstance("EC").apply { init(ECGenParameterSpec("secp256r1")) }
            .getParameterSpec(ECParameterSpec::class.java)
        val asPrivate = KeyFactory.getInstance("EC").generatePrivate(
            ECPrivateKeySpec(BigInteger(1, decoder.decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw")), curve)
        )
        // Der öffentliche Absenderschlüssel steht im Kopf der erwarteten Nachricht (nach Salt, rs und idlen).
        val asPublic = WebPushEncryption.publicKeyOf(expected.copyOfRange(21, 86))

        val body = WebPushEncryption.encrypt(
            "When I grow up, I want to be a watermelon".toByteArray(),
            decoder.decode("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
            decoder.decode("BTBZMqHH6r4Tts7J_aSIgg"),
            KeyPair(asPublic, asPrivate),
            decoder.decode("DGv6ra1nlYgDCS1FRnbzlw")
        )

        assertArrayEquals(expected, body)
    }
}
