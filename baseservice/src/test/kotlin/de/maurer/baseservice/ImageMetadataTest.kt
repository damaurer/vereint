package de.maurer.baseservice

import de.maurer.baseservice.support.ImageMetadata
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.zip.CRC32
import javax.imageio.ImageIO

class ImageMetadataTest {

    private val secret = "GPS 52.5200N 13.4050E Pixel 9"

    private fun encode(format: String): ByteArray {
        val image = BufferedImage(16, 8, BufferedImage.TYPE_INT_RGB)
        image.setRGB(3, 3, 0xFF0000)
        return ByteArrayOutputStream().also { ImageIO.write(image, format, it) }.toByteArray()
    }

    private fun segment(marker: Int, payload: ByteArray): ByteArray {
        val length = payload.size + 2
        return byteArrayOf(0xFF.toByte(), marker.toByte(), (length shr 8).toByte(), length.toByte()) + payload
    }

    /** EXIF (Little Endian) mit Orientation und einem Text-Tag als Stellvertreter für GPS-Daten. */
    private fun exif(orientation: Int): ByteArray {
        val text = secret.toByteArray() + 0
        val tiff = ByteBuffer.allocate(8 + 2 + 2 * 12 + 4 + text.size).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        tiff.put('I'.code.toByte()).put('I'.code.toByte()).putShort(42).putInt(8)
        tiff.putShort(2)
        tiff.putShort(0x0112).putShort(3).putInt(1).putShort(orientation.toShort()).putShort(0)
        tiff.putShort(0x010F).putShort(2).putInt(text.size).putInt(8 + 2 + 24 + 4)
        tiff.putInt(0)
        tiff.put(text)
        return "Exif\u0000\u0000".toByteArray() + tiff.array()
    }

    /** Fügt Segmente direkt hinter SOI bzw. APP0 ein. */
    private fun withJpegSegments(jpeg: ByteArray, vararg segments: ByteArray): ByteArray {
        val afterApp0 = if ((jpeg[3].toInt() and 0xFF) == 0xE0) {
            4 + (((jpeg[4].toInt() and 0xFF) shl 8) or (jpeg[5].toInt() and 0xFF))
        } else 2
        return jpeg.copyOfRange(0, afterApp0) + segments.reduce(ByteArray::plus) + jpeg.copyOfRange(afterApp0, jpeg.size)
    }

    private fun pngChunk(type: String, data: ByteArray): ByteArray {
        val crc = CRC32().apply { update(type.toByteArray()); update(data) }.value
        return ByteBuffer.allocate(12 + data.size).putInt(data.size).put(type.toByteArray()).put(data)
            .putInt(crc.toInt()).array()
    }

    private fun contains(haystack: ByteArray, needle: String) =
        String(haystack, Charsets.ISO_8859_1).contains(needle)

    @Test
    fun `strips EXIF, XMP and comments from a JPEG but keeps the orientation`() {
        val original = withJpegSegments(
            encode("jpg"),
            segment(0xE1, exif(orientation = 6)),
            segment(0xE1, "http://ns.adobe.com/xap/1.0/\u0000<x:xmpmeta>$secret</x:xmpmeta>".toByteArray()),
            segment(0xED, "Photoshop 3.0\u0000$secret".toByteArray()),
            segment(0xFE, secret.toByteArray())
        )
        assertTrue(contains(original, secret))

        val cleaned = ImageMetadata.strip(original)

        assertFalse(contains(cleaned, secret))
        assertFalse(contains(cleaned, "xmpmeta"))
        val decoded = ImageIO.read(ByteArrayInputStream(cleaned))
        assertEquals(16, decoded.width)
        assertEquals(8, decoded.height)
        // Minimaler EXIF-Block, Big Endian, Orientation = 6
        val exifAt = String(cleaned, Charsets.ISO_8859_1).indexOf("Exif\u0000\u0000MM")
        assertTrue(exifAt > 0)
        assertEquals(6, cleaned[exifAt + 6 + 8 + 2 + 8 + 1].toInt())
    }

    @Test
    fun `leaves a JPEG without metadata unchanged`() {
        val original = encode("jpg")
        assertArrayEquals(original, ImageMetadata.strip(original))
    }

    @Test
    fun `does not add an orientation block for upright photos`() {
        val original = withJpegSegments(encode("jpg"), segment(0xE1, exif(orientation = 1)))
        val cleaned = ImageMetadata.strip(original)
        assertFalse(contains(cleaned, "Exif"))
        assertArrayEquals(encode("jpg"), cleaned)
    }

    @Test
    fun `keeps the ICC colour profile`() {
        val icc = segment(0xE2, "ICC_PROFILE\u0000\u0001\u0001profile".toByteArray())
        val cleaned = ImageMetadata.strip(withJpegSegments(encode("jpg"), icc))
        assertTrue(contains(cleaned, "ICC_PROFILE"))
    }

    @Test
    fun `strips text and EXIF chunks from a PNG`() {
        val png = encode("png")
        val iend = png.size - 12
        val original = png.copyOfRange(0, iend) +
            pngChunk("tEXt", "Comment\u0000$secret".toByteArray()) +
            pngChunk("eXIf", exif(orientation = 1).copyOfRange(6, exif(1).size)) +
            png.copyOfRange(iend, png.size)
        assertTrue(contains(original, secret))

        val cleaned = ImageMetadata.strip(original)

        assertFalse(contains(cleaned, secret))
        assertArrayEquals(png, cleaned)
        assertNotNull(ImageIO.read(ByteArrayInputStream(cleaned)))
    }

    @Test
    fun `rejects a truncated JPEG instead of storing it with metadata`() {
        val original = withJpegSegments(encode("jpg"), segment(0xE1, exif(orientation = 6)))
        assertThrows<IllegalArgumentException> { ImageMetadata.strip(original.copyOfRange(0, 30)) }
    }

    @Test
    fun `passes other formats through`() {
        val gif = encode("gif")
        assertSame(gif, ImageMetadata.strip(gif))
    }
}
