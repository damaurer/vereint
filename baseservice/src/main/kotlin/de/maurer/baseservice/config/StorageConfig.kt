package de.maurer.baseservice.config

import de.maurer.baseservice.storage.InMemoryObjectStorage
import de.maurer.baseservice.storage.ObjectStorage
import de.maurer.baseservice.storage.S3ObjectStorage
import de.maurer.baseservice.storage.StorageProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * Auswahl der Objektspeicher-Anbindung (TICKET-014).
 *
 * Bei `vereint.storage.enabled=true` wird die echte S3-/MinIO-Anbindung
 * ([S3ObjectStorage]) verwendet; andernfalls (Tests, lokale Läufe ohne MinIO)
 * greift der In-Memory-Speicher ([InMemoryObjectStorage]).
 */
@Configuration
@EnableConfigurationProperties(StorageProperties::class)
class StorageConfig {

    @Bean
    @ConditionalOnProperty(prefix = "vereint.storage", name = ["enabled"], havingValue = "true")
    fun s3ObjectStorage(properties: StorageProperties): ObjectStorage = S3ObjectStorage(properties)

    @Bean
    @ConditionalOnMissingBean(ObjectStorage::class)
    fun inMemoryObjectStorage(properties: StorageProperties): ObjectStorage =
        InMemoryObjectStorage(properties.bucket)
}
