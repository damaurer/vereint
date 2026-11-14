package de.maurer.baseservice.storage

import java.io.IOException
import java.io.InputStream
import java.net.URI
import java.nio.channels.Channels
import java.nio.channels.FileChannel
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.time.Duration

/**
 * Objektspeicher in einem lokalen Verzeichnis, für den Betrieb auf einem
 * eigenen Server ohne S3 (z. B. ein VPS mit Docker-Volume).
 *
 * Jeder Schlüssel wird zu einer Datei unterhalb von [root]; Schlüssel mit `..`,
 * führendem `/` oder leeren Segmenten werden abgewiesen, damit nichts außerhalb
 * des Verzeichnisses gelesen oder geschrieben werden kann. Geschrieben wird in
 * eine temporäre Datei im Zielordner, die nach `fsync` atomar an ihren Platz
 * rückt: Ein abgebrochener Upload hinterlässt nie eine halbe Datei.
 *
 * Die Inhalte sind bereits vom Aufrufer verschlüsselt (siehe
 * [de.maurer.baseservice.crypto.DataEncryptor]); Backups des Verzeichnisses
 * sind ohne `DATA_ENCRYPTION_KEY` nicht lesbar.
 */
class FileSystemObjectStorage(root: Path) : ObjectStorage {

    private val root: Path = root.toAbsolutePath().normalize()

    init {
        Files.createDirectories(this.root)
    }

    override fun store(key: String, data: ByteArray, contentType: String) {
        storeStream(key, data.inputStream(), data.size.toLong(), contentType)
    }

    override fun storeStream(key: String, data: InputStream, length: Long, contentType: String) {
        val target = resolve(key)
        Files.createDirectories(target.parent)
        val temp = Files.createTempFile(target.parent, ".upload-", ".tmp")
        try {
            FileChannel.open(temp, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING).use { channel ->
                val written = data.transferTo(Channels.newOutputStream(channel))
                if (written != length) {
                    throw IOException("Datenstrom für '$key' hat $written statt $length Byte")
                }
                channel.force(true)
            }
            moveIntoPlace(temp, target)
        } finally {
            Files.deleteIfExists(temp)
        }
    }

    override fun read(key: String): ByteArray? = try {
        Files.readAllBytes(resolve(key))
    } catch (_: NoSuchFileException) {
        null
    }

    override fun readRange(key: String, start: Long, endInclusive: Long): InputStream? {
        val channel = try {
            FileChannel.open(resolve(key), StandardOpenOption.READ)
        } catch (_: NoSuchFileException) {
            return null
        }
        val size = channel.size()
        val from = start.coerceIn(0, size)
        val count = ((endInclusive + 1).coerceIn(from, size) - from)
        channel.position(from)
        return BoundedInputStream(Channels.newInputStream(channel), count)
    }

    override fun delete(key: String) {
        Files.deleteIfExists(resolve(key))
    }

    /**
     * Ein Verzeichnis hat keine signierten URLs. Die App liefert Dateien
     * ohnehin nur über ihre eigenen, berechtigungsgeprüften Endpunkte aus.
     */
    override fun presignedGetUrl(key: String, ttl: Duration): URI =
        throw UnsupportedOperationException("Der Dateisystem-Speicher erzeugt keine signierten URLs")

    private fun resolve(key: String): Path {
        val segments = key.split("/")
        require(key.isNotEmpty() && segments.none { it.isEmpty() || it == "." || it == ".." }) {
            "Ungültiger Speicherschlüssel"
        }
        val path = root.resolve(key).normalize()
        require(path.startsWith(root) && path != root) { "Ungültiger Speicherschlüssel" }
        return path
    }

    private fun moveIntoPlace(temp: Path, target: Path) {
        try {
            Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING)
        }
    }

    /** Liest höchstens [remaining] Byte und schließt die Datei mit. */
    private class BoundedInputStream(private val delegate: InputStream, private var remaining: Long) : InputStream() {
        override fun read(): Int {
            if (remaining <= 0) return -1
            val value = delegate.read()
            if (value >= 0) remaining--
            return value
        }

        override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
            if (remaining <= 0) return -1
            val count = delegate.read(buffer, offset, minOf(length.toLong(), remaining).toInt())
            if (count > 0) remaining -= count
            return count
        }

        override fun close() = delegate.close()
    }
}
