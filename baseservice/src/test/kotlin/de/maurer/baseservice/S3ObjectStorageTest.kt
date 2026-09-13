package de.maurer.baseservice

import de.maurer.baseservice.storage.S3ObjectStorage
import de.maurer.baseservice.storage.StorageProperties
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Duration

class S3ObjectStorageTest {

    private val properties = StorageProperties(
        enabled = true,
        endpoint = "http://minio:9000",
        bucket = "vereint",
        region = "eu-central-1",
        accessKey = "minio-access",
        secretKey = "minio-secret",
        pathStyleAccess = true
    )

    private val storage = S3ObjectStorage(properties)

    @Test
    fun `presignedGetUrl produces a SigV4 query-signed url in path style`() {
        val url = storage.presignedGetUrl("profile/abc/img.png", Duration.ofMinutes(5)).toString()

        assertTrue(url.startsWith("http://minio:9000/vereint/profile/abc/img.png?"), "unerwartete Basis-URL: $url")
        assertTrue(url.contains("X-Amz-Algorithm=AWS4-HMAC-SHA256"))
        assertTrue(url.contains("X-Amz-Credential=minio-access%2F"))
        assertTrue(url.contains("eu-central-1%2Fs3%2Faws4_request"))
        assertTrue(url.contains("X-Amz-Expires=300"))
        assertTrue(url.contains("X-Amz-SignedHeaders=host"))
        assertTrue(Regex("X-Amz-Signature=[0-9a-f]{64}").containsMatchIn(url), "Signatur fehlt oder ist ungültig: $url")
    }

    @Test
    fun `presignedGetUrl clamps a too-short ttl to the minimum`() {
        val url = storage.presignedGetUrl("x.png", Duration.ofSeconds(1)).toString()
        assertTrue(url.contains("X-Amz-Expires=${StorageProperties.MIN_TTL_SECONDS}"))
    }
}
