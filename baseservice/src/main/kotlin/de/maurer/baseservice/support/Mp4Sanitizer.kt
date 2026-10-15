package de.maurer.baseservice.support

import java.io.IOException
import java.io.InputStream
import java.nio.ByteBuffer

/**
 * Entfernt Metadaten aus MP4-/MOV-Videos (ISO Base Media File Format), während
 * die Datei durchgereicht wird, und ermittelt dabei die Videolänge.
 *
 * Handyvideos tragen den Aufnahmeort in `udta` (Android: `©xyz`) und `meta`
 * (iOS: `com.apple.quicktime.location.ISO6709`), dazu Gerätedaten. Statt diese
 * Boxen herauszuschneiden, werden sie zu gleich langen `free`-Boxen mit
 * Nullbytes. Alle Byte-Positionen bleiben dadurch gleich, die Verweise der
 * Videospuren auf `mdat` stimmen weiter, und die Länge der Ausgabe ist die der
 * Eingabe (wichtig für das Ablegen als Strom mit bekannter Länge).
 *
 * `moov` (Inhaltsverzeichnis, typisch einige 100 KB) wird ganz gelesen und
 * bereinigt; `mdat` (die eigentlichen Bild- und Tondaten) läuft ungepuffert
 * durch. Ist die Datei kein MP4/MOV, fehlt `moov` oder ist sie länger als
 * [maxDurationMillis], bricht das Lesen mit [InvalidVideoException] ab.
 */
class Mp4SanitizingInputStream(
    private val source: InputStream,
    private val maxDurationMillis: Long,
    private val maxMoovBytes: Int = DEFAULT_MAX_MOOV_BYTES
) : InputStream() {

    /** Videolänge aus `mvhd`, sobald `moov` gelesen wurde. */
    var durationMillis: Long? = null
        private set

    private var boxIndex = 0
    private var buffer = ByteArray(0)
    private var bufferPos = 0
    private var passthrough = 0L
    private var zeroFill = 0L
    private var passthroughToEnd = false
    private var finished = false
    private val scratch = ByteArray(COPY_BUFFER)

    override fun read(): Int {
        val one = ByteArray(1)
        return if (read(one, 0, 1) == -1) -1 else one[0].toInt() and 0xFF
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        if (len == 0) return 0
        while (true) {
            if (bufferPos < buffer.size) {
                val n = minOf(len, buffer.size - bufferPos)
                System.arraycopy(buffer, bufferPos, b, off, n)
                bufferPos += n
                return n
            }
            if (passthroughToEnd) {
                val n = source.read(b, off, len)
                if (n == -1) finish()
                return n
            }
            if (passthrough > 0) {
                val n = source.read(b, off, minOf(len.toLong(), passthrough).toInt())
                if (n == -1) throw InvalidVideoException("Videodatei ist unvollständig")
                passthrough -= n
                return n
            }
            if (zeroFill > 0) {
                val n = minOf(len.toLong(), zeroFill, scratch.size.toLong()).toInt()
                val read = source.readNBytes(scratch, 0, n)
                if (read != n) throw InvalidVideoException("Videodatei ist unvollständig")
                b.fill(0, off, off + n)
                zeroFill -= n
                return n
            }
            if (finished) return -1
            if (!nextBox()) return -1
        }
    }

    /** Liest den nächsten Box-Kopf und legt fest, wie die Box ausgegeben wird. */
    private fun nextBox(): Boolean {
        val head = source.readNBytes(8)
        if (head.isEmpty()) {
            finish()
            return false
        }
        if (head.size < 8) throw InvalidVideoException("Videodatei ist unvollständig")
        val size32 = u32(head, 0)
        val type = String(head, 4, 4, Charsets.ISO_8859_1)
        var header = head
        val size: Long = when (size32) {
            0L -> -1L
            1L -> {
                val large = source.readNBytes(8)
                if (large.size < 8) throw InvalidVideoException("Videodatei ist unvollständig")
                header = head + large
                ByteBuffer.wrap(large).long
            }
            else -> size32
        }
        if (size != -1L && size < header.size) throw InvalidVideoException("Ungültige Box '$type'")

        if (boxIndex++ == 0 && type != "ftyp") {
            throw InvalidVideoException("Kein MP4/MOV-Video")
        }

        when {
            type == "moov" -> {
                if (size == -1L || size > maxMoovBytes) throw InvalidVideoException("Inhaltsverzeichnis des Videos ist zu groß")
                val body = source.readNBytes((size - header.size).toInt())
                if (body.size.toLong() != size - header.size) throw InvalidVideoException("Videodatei ist unvollständig")
                val box = header + body
                sanitizeContainer(box, header.size, box.size, depth = 0)
                durationMillis = readDuration(box, header.size, box.size)
                    ?: throw InvalidVideoException("Videolänge ist nicht erkennbar")
                if (durationMillis!! > maxDurationMillis) throw VideoTooLongException(durationMillis!!)
                buffer = box
            }
            type in STRIPPED_BOXES -> {
                if (size == -1L) throw InvalidVideoException("Ungültige Box '$type'")
                buffer = header.copyOf().also { "free".toByteArray(Charsets.ISO_8859_1).copyInto(it, 4) }
                zeroFill = size - header.size
            }
            size == -1L -> {
                buffer = header
                passthroughToEnd = true
            }
            else -> {
                buffer = header
                passthrough = size - header.size
            }
        }
        bufferPos = 0
        return true
    }

    private fun finish() {
        if (finished) return
        finished = true
        if (durationMillis == null) throw InvalidVideoException("Videodatei enthält kein Inhaltsverzeichnis (moov)")
    }

    /** Macht `udta`/`meta` in [box] (zwischen [from] und [to]) zu `free`-Boxen voller Nullbytes. */
    private fun sanitizeContainer(box: ByteArray, from: Int, to: Int, depth: Int) {
        var pos = from
        while (pos + 8 <= to) {
            var size = u32(box, pos)
            var headerLength = 8
            if (size == 1L) {
                if (pos + 16 > to) throw InvalidVideoException("Ungültige Box im Inhaltsverzeichnis")
                size = ByteBuffer.wrap(box, pos + 8, 8).long
                headerLength = 16
            } else if (size == 0L) {
                size = (to - pos).toLong()
            }
            if (size < headerLength || pos + size > to) throw InvalidVideoException("Ungültige Box im Inhaltsverzeichnis")
            val end = (pos + size).toInt()
            val type = String(box, pos + 4, 4, Charsets.ISO_8859_1)
            when {
                type in STRIPPED_BOXES -> {
                    "free".toByteArray(Charsets.ISO_8859_1).copyInto(box, pos + 4)
                    box.fill(0, pos + headerLength, end)
                }
                type in CONTAINER_BOXES && depth < MAX_DEPTH ->
                    sanitizeContainer(box, pos + headerLength, end, depth + 1)
            }
            pos = end
        }
    }

    /** Liest Zeitskala und Dauer aus `mvhd` direkt unter `moov`. */
    private fun readDuration(box: ByteArray, from: Int, to: Int): Long? {
        var pos = from
        while (pos + 8 <= to) {
            val size = u32(box, pos).toInt()
            if (size < 8 || pos + size > to) return null
            if (String(box, pos + 4, 4, Charsets.ISO_8859_1) == "mvhd" && size >= 32) {
                val version = box[pos + 8].toInt()
                val (timescale, duration) = if (version == 1) {
                    if (size < 44) return null
                    u32(box, pos + 28) to ByteBuffer.wrap(box, pos + 32, 8).long
                } else {
                    u32(box, pos + 20) to u32(box, pos + 24)
                }
                if (timescale <= 0 || duration <= 0) return null
                return duration * 1000 / timescale
            }
            pos += size
        }
        return null
    }

    private fun u32(data: ByteArray, pos: Int): Long =
        ((data[pos].toLong() and 0xFF) shl 24) or ((data[pos + 1].toLong() and 0xFF) shl 16) or
            ((data[pos + 2].toLong() and 0xFF) shl 8) or (data[pos + 3].toLong() and 0xFF)

    override fun close() = source.close()

    companion object {
        const val DEFAULT_MAX_MOOV_BYTES = 16 * 1024 * 1024
        private const val COPY_BUFFER = 64 * 1024
        private const val MAX_DEPTH = 6
        private val STRIPPED_BOXES = setOf("udta", "meta", "uuid", "XMP_")
        private val CONTAINER_BOXES = setOf("moov", "trak", "mdia", "minf", "stbl", "edts")
    }
}

/** Die Datei ist kein lesbares MP4/MOV-Video. */
open class InvalidVideoException(message: String) : IOException(message)

/** Das Video ist länger als erlaubt. */
class VideoTooLongException(val durationMillis: Long) : InvalidVideoException("Video ist zu lang")
