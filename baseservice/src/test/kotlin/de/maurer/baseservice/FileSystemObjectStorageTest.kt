package de.maurer.baseservice

import de.maurer.baseservice.config.StorageConfig
import de.maurer.baseservice.storage.FileSystemObjectStorage
import de.maurer.baseservice.storage.InMemoryObjectStorage
import de.maurer.baseservice.storage.S3ObjectStorage
import de.maurer.baseservice.storage.StorageProperties
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path

class FileSystemObjectStorageTest {

    @TempDir
    lateinit var dir: Path

    private fun storage() = FileSystemObjectStorage(dir.resolve("files"))

    @Test
    fun `stores, reads and deletes objects below the root`() {
        val storage = storage()
        storage.store("profile/abc/img.bin", byteArrayOf(1, 2, 3), "application/octet-stream")

        assertArrayEquals(byteArrayOf(1, 2, 3), storage.read("profile/abc/img.bin"))
        assertTrue(Files.exists(dir.resolve("files/profile/abc/img.bin")))

        storage.delete("profile/abc/img.bin")
        assertNull(storage.read("profile/abc/img.bin"))
        storage.delete("profile/abc/img.bin") // fehlendes Objekt ist kein Fehler
    }

    @Test
    fun `readRange returns exactly the requested bytes and null for missing objects`() {
        val storage = storage()
        val data = ByteArray(100) { it.toByte() }
        storage.storeStream("moments/video.bin", ByteArrayInputStream(data), data.size.toLong(), "video/mp4")

        val range = storage.readRange("moments/video.bin", 10, 19)!!.use { it.readAllBytes() }
        assertArrayEquals(data.copyOfRange(10, 20), range)
        val tail = storage.readRange("moments/video.bin", 95, 500)!!.use { it.readAllBytes() }
        assertArrayEquals(data.copyOfRange(95, 100), tail)
        assertNull(storage.readRange("moments/missing.bin", 0, 9))
    }

    @Test
    fun `a broken upload leaves neither a partial file nor temp files`() {
        val storage = storage()
        storage.store("moments/video.bin", byteArrayOf(9), "video/mp4")
        val failing = object : InputStream() {
            private var sent = 0
            override fun read(): Int = if (sent++ < 10) 1 else throw IOException("Verbindung abgebrochen")
        }

        assertThrows<IOException> { storage.storeStream("moments/video.bin", failing, 100, "video/mp4") }
        assertThrows<IOException> {
            storage.storeStream("moments/video.bin", ByteArrayInputStream(ByteArray(5)), 100, "video/mp4")
        }

        assertArrayEquals(byteArrayOf(9), storage.read("moments/video.bin"), "vorhandene Datei bleibt unverändert")
        Files.list(dir.resolve("files/moments")).use { files ->
            assertEquals(listOf("video.bin"), files.map { it.fileName.toString() }.toList())
        }
    }

    @Test
    fun `keys cannot escape the root`() {
        val storage = storage()
        for (key in listOf("../secret", "a/../../secret", "/etc/passwd", "a//b", "", "a/./b")) {
            assertThrows<IllegalArgumentException>("Schlüssel '$key'") { storage.store(key, byteArrayOf(1), "x") }
            assertThrows<IllegalArgumentException>("Schlüssel '$key'") { storage.read(key) }
        }
        assertFalse(Files.exists(dir.resolve("secret")))
    }

    @Test
    fun `backend selection keeps S3_ENABLED compatible and accepts filesystem`() {
        val config = StorageConfig()
        assertTrue(config.objectStorage(StorageProperties()) is InMemoryObjectStorage)
        assertTrue(config.objectStorage(StorageProperties(enabled = true, endpoint = "http://minio:9000")) is S3ObjectStorage)
        assertTrue(
            config.objectStorage(StorageProperties(backend = "filesystem", directory = dir.toString())) is FileSystemObjectStorage
        )
        assertTrue(
            config.objectStorage(StorageProperties(enabled = true, backend = "memory")) is InMemoryObjectStorage
        )
        assertThrows<IllegalArgumentException> { config.objectStorage(StorageProperties(backend = "filesystem")) }
        assertThrows<IllegalArgumentException> { config.objectStorage(StorageProperties(backend = "ftp")) }
    }
}
