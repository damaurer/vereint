package de.maurer.baseservice.config

import de.maurer.baseservice.storage.FileSystemObjectStorage
import de.maurer.baseservice.storage.InMemoryObjectStorage
import de.maurer.baseservice.storage.ObjectStorage
import de.maurer.baseservice.storage.S3ObjectStorage
import de.maurer.baseservice.storage.StorageProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.nio.file.Path

/**
 * Auswahl der Objektspeicher-Anbindung (TICKET-014).
 *
 * `vereint.storage.backend` entscheidet (siehe [StorageProperties.effectiveBackend]):
 * `s3` nutzt die S3-/MinIO-Anbindung ([S3ObjectStorage]), `filesystem` ein
 * lokales Verzeichnis ([FileSystemObjectStorage], eigener Server ohne S3) und
 * `memory` den In-Memory-Speicher ([InMemoryObjectStorage], Tests und lokale
 * Läufe ohne MinIO).
 */
@Configuration
@EnableConfigurationProperties(StorageProperties::class)
class StorageConfig {

    @Bean
    fun objectStorage(properties: StorageProperties): ObjectStorage =
        when (properties.effectiveBackend()) {
            StorageProperties.BACKEND_S3 -> S3ObjectStorage(properties)
            StorageProperties.BACKEND_FILESYSTEM -> {
                require(properties.directory.isNotBlank()) {
                    "STORAGE_DIRECTORY fehlt (nötig für STORAGE_BACKEND=filesystem)"
                }
                FileSystemObjectStorage(Path.of(properties.directory))
            }
            else -> InMemoryObjectStorage(properties.bucket)
        }
}
