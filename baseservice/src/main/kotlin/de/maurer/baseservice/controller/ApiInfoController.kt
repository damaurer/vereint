package de.maurer.baseservice.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.boot.info.BuildProperties
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * API-Version und Artefaktversion werden getrennt ausgewiesen: `version` beschreibt
 * den Vertrag (`/api/v1`), `buildVersion` das gebaute Artefakt.
 */
object ApiMetadata {
    const val SERVICE_NAME = "vereint-baseservice"
    const val API_VERSION = "v1"
    const val DESCRIPTION = "VEREINT Fachservice API v1"
    const val UNKNOWN_BUILD_VERSION = "unknown"
}

data class ApiInfoResponse(
    val service: String,
    val version: String,
    val buildVersion: String,
    val description: String
)

@RestController
@RequestMapping("/api/v1/info")
@Tag(name = "API Info", description = "API Metadata and Version Information")
class ApiInfoController(
    private val buildProperties: BuildProperties?
) {

    @GetMapping
    @Operation(summary = "API Info", description = "Liefert Metadaten zur API-Versionierung")
    fun info(): ResponseEntity<ApiInfoResponse> {
        return ResponseEntity.ok(
            ApiInfoResponse(
                service = ApiMetadata.SERVICE_NAME,
                version = ApiMetadata.API_VERSION,
                buildVersion = buildProperties?.version ?: ApiMetadata.UNKNOWN_BUILD_VERSION,
                description = ApiMetadata.DESCRIPTION
            )
        )
    }
}
