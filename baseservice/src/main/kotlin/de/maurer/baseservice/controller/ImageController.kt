package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.ImageAssetDto
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.ImageService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile

/**
 * REST-Endpunkte des S3-kompatiblen Bildspeichers (TICKET-014).
 *
 * Der Upload erfolgt als Multipart; alle fachlichen Prüfungen (Typ, Größe,
 * Dimensionen, Berechtigung) laufen serverseitig im [ImageService]. Die Antwort
 * enthält ausschließlich Metadaten und die URL des Inhalts-Endpunkts, der die
 * Bilddaten nach erneuter Berechtigungsprüfung entschlüsselt ausliefert.
 */
@RestController
@RequestMapping("/api/v1/images")
@Tag(name = "Bilder", description = "Sicherer, zweckgebundener Bildspeicher mit privaten URLs")
class ImageController(
    private val imageService: ImageService,
    private val authContext: AuthContext
) {

    private fun imageId(id: String) = Identifiers.parseUuid(id, "imageId")

    @PostMapping(consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    @Operation(summary = "Bild hochladen", description = "Lädt ein zweckgebundenes Bild hoch und legt es im Objektspeicher ab")
    fun uploadImage(
        @RequestParam("file") file: MultipartFile,
        @RequestParam("purpose") purpose: String,
        @RequestParam("targetId", required = false) targetId: String?
    ): ResponseEntity<ImageAssetDto> {
        if (file.isEmpty) {
            throw InvalidRequestException(Msg("error.image.noFile"), ErrorCode.INVALID_REQUEST)
        }
        val principal = authContext.getRequiredPrincipal()
        val dto = imageService.uploadImage(
            purposeValue = purpose,
            targetIdValue = targetId,
            originalFilename = file.originalFilename,
            contentType = file.contentType,
            data = file.bytes,
            principal = principal
        )
        return ResponseEntity.status(HttpStatus.CREATED).body(dto)
    }

    @GetMapping
    @Operation(summary = "Bilder auflisten", description = "Listet die aktuell gültigen Bilder eines Objekts für berechtigte Benutzer")
    fun listImages(
        @RequestParam("purpose") purpose: String,
        @RequestParam("targetId", required = false) targetId: String?
    ): ResponseEntity<List<ImageAssetDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(imageService.listImages(purpose, targetId, principal))
    }

    @GetMapping("/{id}")
    @Operation(summary = "Bild abrufen", description = "Liefert Metadaten und die URL der Bilddaten")
    fun getImage(@PathVariable id: String): ResponseEntity<ImageAssetDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(imageService.getImage(imageId(id), principal))
    }

    @GetMapping("/{id}/content")
    @Operation(summary = "Bilddaten abrufen", description = "Liefert die entschlüsselten Bilddaten für berechtigte Benutzer")
    fun getImageContent(@PathVariable id: String): ResponseEntity<ByteArray> {
        val principal = authContext.getRequiredPrincipal()
        val content = imageService.getImageContent(imageId(id), principal)
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(content.contentType))
            .header(HttpHeaders.CACHE_CONTROL, "private, no-store")
            .header("X-Content-Type-Options", "nosniff")
            .body(content.data)
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Bild löschen", description = "Entfernt ein Bild aus dem Objektspeicher (Eigentümer sowie Vorstand/Admin)")
    fun deleteImage(@PathVariable id: String): ResponseEntity<Void> {
        val principal = authContext.getRequiredPrincipal()
        imageService.deleteImage(imageId(id), principal)
        return ResponseEntity.noContent().build()
    }
}
