package de.maurer.baseservice.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.boot.info.BuildProperties
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

data class HealthResponse(
    val status: String,
    val service: String,
    /** API-Version des Vertrags (Pfadpräfix `/api/v1`). */
    val version: String,
    /** Artefaktversion aus dem Gradle-Build (`springBoot { buildInfo() }`). */
    val buildVersion: String,
    val timestamp: Instant = Instant.now()
)

@RestController
@RequestMapping("/api/v1/health")
@Tag(name = "Health", description = "Service Health Check API")
class HealthController(
    private val buildProperties: BuildProperties?
) {

    @GetMapping
    @Operation(summary = "Health check endpoint", description = "Liefert den aktuellen Servicestatus")
    fun health(): ResponseEntity<HealthResponse> {
        return ResponseEntity.ok(
            HealthResponse(
                status = "UP",
                service = ApiMetadata.SERVICE_NAME,
                version = ApiMetadata.API_VERSION,
                buildVersion = buildProperties?.version ?: ApiMetadata.UNKNOWN_BUILD_VERSION
            )
        )
    }
}
