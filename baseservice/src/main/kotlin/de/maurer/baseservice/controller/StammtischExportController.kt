package de.maurer.baseservice.controller

import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.StammtischExportService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ContentDisposition
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

/** Datenexport des aktuellen Stammtischs. */
@RestController
@RequestMapping("/api/v1/stammtisch")
@Tag(name = "Datenexport", description = "Alle Daten des aktuellen Stammtischs als JSON")
class StammtischExportController(
    private val exportService: StammtischExportService,
    private val authContext: AuthContext
) {

    @GetMapping("/export")
    @Operation(summary = "Datenexport (JSON)", description = "Erfordert stammtisch.manage")
    fun export(): ResponseEntity<Map<String, Any?>> {
        val export = exportService.export(authContext.getRequiredPrincipal())
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_JSON)
            .header(
                HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment().filename(export.fileName).build().toString()
            )
            .body(export.content)
    }
}

