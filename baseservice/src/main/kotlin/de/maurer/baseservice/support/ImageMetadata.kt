package de.maurer.baseservice.support

import java.io.ByteArrayOutputStream

/**
 * Entfernt eingebettete Metadaten aus hochgeladenen Bildern, ohne die
 * Bilddaten neu zu kodieren (keine Qualitätsverluste).
 *
 * Handyfotos tragen in EXIF/XMP oft den GPS-Standort, Gerätedaten und
 * Aufnahmezeit. Diese Angaben würden sonst an alle Mitglieder ausgeliefert,
 * die das Bild sehen dürfen.
 *
 * - JPEG: entfernt APP1 (EXIF, XMP), APP3–APP13 (u. a. IPTC), APP15 und
 *   Kommentare. Erhalten bleiben JFIF (APP0), das Farbprofil (APP2
 *   `ICC_PROFILE`) und Adobe (APP14, nötig für CMYK). Die EXIF-Ausrichtung wird
 *   als minimaler EXIF-Block neu geschrieben, damit Hochformatfotos nicht
 *   gedreht erscheinen.
 * - PNG: entfernt Text-, EXIF- und Zeitstempel-Chunks.
 * - Andere Formate (GIF) bleiben unverändert.
 *
 * Ist ein Bild nicht wie erwartet aufgebaut, wird [IllegalArgumentException]
 * geworfen; der Aufrufer lehnt den Upload dann ab, statt Metadaten zu
 * speichern.
 */
object ImageMetadata {

    private val PNG_SIGNATURE = byteArrayOf(
        0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    )
    private val PNG_METADATA_CHUNKS = setOf("tEXt", "zTXt", "iTXt", "eXIf", "tIME")
    private val ICC_PROFILE = "ICC_PROFILE\u0000".toByteArray(Charsets.US_ASCII)
    private val EXIF_HEADER = "Exif\u0000\u0000".toByteArray(Charsets.US_ASCII)

    private const val MARKER_SOS = 0xDA
    private const val MARKER_EOI = 0xD9
    private const val MARKER_APP0 = 0xE0
    private const val MARKER_APP1 = 0xE1
    private const val MARKER_APP2 = 0xE2
    private const val MARKER_APP14 = 0xEE
    private const val MARKER_COM = 0xFE
    private const val TAG_ORIENTATION = 0x0112

    fun strip(data: ByteArray): ByteArray = when {
        isJpeg(data) -> stripJpeg(data)
        isPng(data) -> stripPng(data)
        else -> data
    }

    private fun isJpeg(data: ByteArray) =
        data.size >= 4 && u8(data, 0) == 0xFF && u8(data, 1) == 0xD8

    private fun isPng(data: ByteArray) =
        data.size >= PNG_SIGNATURE.size && data.copyOfRange(0, PNG_SIGNATURE.size).contentEquals(PNG_SIGNATURE)

    private fun stripJpeg(data: ByteArray): ByteArray {
        val out = ByteArrayOutputStream(data.size)
        out.write(data, 0, 2)
        val kept = mutableListOf<Pair<Int, ByteArray>>()
        var orientation: Int? = null
        var pos = 2

        while (true) {
            require(pos < data.size && u8(data, pos) == 0xFF) { "JPEG-Segment erwartet bei $pos" }
            while (pos < data.size && u8(data, pos) == 0xFF) pos++
            require(pos < data.size) { "JPEG endet unerwartet" }
            val marker = u8(data, pos++)
            if (marker == MARKER_EOI) {
                flush(out, kept, orientation)
                out.write(0xFF)
                out.write(marker)
                return out.toByteArray()
            }
            require(pos + 2 <= data.size) { "JPEG-Segmentlänge fehlt" }
            val length = u16be(data, pos)
            require(length >= 2 && pos + length <= data.size) { "JPEG-Segmentlänge ungültig" }
            val segment = data.copyOfRange(pos - 2, pos + length)
            val payloadStart = pos + 2
            val payloadEnd = pos + length

            if (marker == MARKER_SOS) {
                // Ab dem ersten Scan folgen nur noch Bilddaten und Tabellen.
                flush(out, kept, orientation)
                out.write(data, pos - 2, data.size - (pos - 2))
                return out.toByteArray()
            }

            when {
                marker == MARKER_APP1 && startsWith(data, payloadStart, payloadEnd, EXIF_HEADER) ->
                    orientation = orientation ?: readOrientation(data, payloadStart + EXIF_HEADER.size, payloadEnd)
                marker == MARKER_APP2 && !startsWith(data, payloadStart, payloadEnd, ICC_PROFILE) -> Unit
                marker in MARKER_APP1..0xEF && marker != MARKER_APP2 && marker != MARKER_APP14 -> Unit
                marker == MARKER_COM -> Unit
                else -> kept += marker to segment
            }
            pos = payloadEnd
        }
    }

    /** Schreibt die behaltenen Segmente; die Ausrichtung folgt direkt auf JFIF. */
    private fun flush(out: ByteArrayOutputStream, kept: MutableList<Pair<Int, ByteArray>>, orientation: Int?) {
        val exif = orientation?.takeIf { it in 2..8 }?.let(::minimalExif)
        var exifWritten = exif == null
        for ((marker, segment) in kept) {
            if (!exifWritten && marker != MARKER_APP0) {
                out.write(exif!!)
                exifWritten = true
            }
            out.write(segment)
        }
        if (!exifWritten) out.write(exif!!)
        kept.clear()
    }

    /** Liest das Orientation-Tag aus IFD0 eines TIFF-Blocks. */
    private fun readOrientation(data: ByteArray, tiffStart: Int, end: Int): Int? {
        if (tiffStart + 8 > end) return null
        val littleEndian = when {
            u8(data, tiffStart) == 0x49 && u8(data, tiffStart + 1) == 0x49 -> true
            u8(data, tiffStart) == 0x4D && u8(data, tiffStart + 1) == 0x4D -> false
            else -> return null
        }
        fun u16(at: Int) = if (littleEndian) u8(data, at) or (u8(data, at + 1) shl 8) else u16be(data, at)
        fun u32(at: Int): Long = if (littleEndian) {
            (u16(at).toLong()) or (u16(at + 2).toLong() shl 16)
        } else {
            (u16be(data, at).toLong() shl 16) or u16be(data, at + 2).toLong()
        }

        val ifd = tiffStart + u32(tiffStart + 4)
        if (ifd < tiffStart || ifd + 2 > end) return null
        val count = u16(ifd.toInt())
        for (index in 0 until count) {
            val entry = ifd.toInt() + 2 + index * 12
            if (entry + 12 > end) return null
            if (u16(entry) == TAG_ORIENTATION) return u16(entry + 8)
        }
        return null
    }

    /** APP1 mit einem TIFF-Block, der nur das Orientation-Tag enthält. */
    private fun minimalExif(orientation: Int): ByteArray {
        val tiff = byteArrayOf(
            0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08, // Big Endian, IFD0 bei 8
            0x00, 0x01, // ein Eintrag
            0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, // Orientation, SHORT, 1 Wert
            0x00, orientation.toByte(), 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00 // kein weiteres IFD
        )
        val length = 2 + EXIF_HEADER.size + tiff.size
        return byteArrayOf(0xFF.toByte(), MARKER_APP1.toByte(), (length shr 8).toByte(), length.toByte()) +
            EXIF_HEADER + tiff
    }

    private fun stripPng(data: ByteArray): ByteArray {
        val out = ByteArrayOutputStream(data.size)
        out.write(data, 0, PNG_SIGNATURE.size)
        var pos = PNG_SIGNATURE.size
        while (pos < data.size) {
            require(pos + 8 <= data.size) { "PNG-Chunk unvollständig" }
            val length = (u16be(data, pos).toLong() shl 16) or u16be(data, pos + 2).toLong()
            val type = String(data, pos + 4, 4, Charsets.US_ASCII)
            val total = 12L + length
            require(pos + total <= data.size) { "PNG-Chunklänge ungültig" }
            if (type !in PNG_METADATA_CHUNKS) out.write(data, pos, total.toInt())
            pos += total.toInt()
            if (type == "IEND") break
        }
        return out.toByteArray()
    }

    private fun startsWith(data: ByteArray, start: Int, end: Int, prefix: ByteArray): Boolean {
        if (end - start < prefix.size) return false
        return prefix.indices.all { data[start + it] == prefix[it] }
    }

    private fun u8(data: ByteArray, at: Int) = data[at].toInt() and 0xFF

    private fun u16be(data: ByteArray, at: Int) = (u8(data, at) shl 8) or u8(data, at + 1)
}
