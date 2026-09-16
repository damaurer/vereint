package de.maurer.baseservice.service

import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.ImageAssetEntity
import de.maurer.baseservice.domain.ImagePurpose
import de.maurer.baseservice.domain.ImageStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.ImageAssetDto
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.ImageAssetRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.storage.ObjectStorage
import de.maurer.baseservice.storage.StorageProperties
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.ByteArrayInputStream
import java.util.UUID
import javax.imageio.ImageIO

/**
 * Fachlicher Slice für den sicheren Bildspeicher (TICKET-014).
 *
 * Der Spring-Service validiert Bildtyp, Größe, Dimensionen und Berechtigungen
 * serverseitig (`deny by default`). Die Binärdaten liegen im S3-kompatiblen
 * Objektspeicher; PostgreSQL speichert ausschließlich die Metadaten (Pfad,
 * Eigentümer, Zweck, Version, Status). Der lesende Zugriff erfolgt nur über
 * zeitlich begrenzte, private URLs (siehe `docs/architektur.md` und
 * `docs/fachkonzept.md`).
 */
@Service
@Transactional
class ImageService(
    private val imageAssetRepository: ImageAssetRepository,
    private val objectStorage: ObjectStorage,
    private val storageProperties: StorageProperties,
    private val userService: UserService,
    private val userRoleRepository: UserRoleRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository
) {

    fun uploadImage(
        purposeValue: String?,
        targetIdValue: String?,
        originalFilename: String?,
        contentType: String?,
        data: ByteArray,
        principal: UserPrincipal
    ): ImageAssetDto {
        val caller = userService.getOrCreateUser(principal)
        val purpose = ImagePurpose.fromValue(purposeValue)
            ?: throw InvalidRequestException("Ungültiger Bildzweck: '${purposeValue.orEmpty()}'", ErrorCode.INVALID_REQUEST)

        val normalizedType = normalizeContentType(contentType)
        if (data.isEmpty()) {
            throw InvalidRequestException("Es wurden keine Bilddaten übertragen", ErrorCode.INVALID_REQUEST)
        }
        if (data.size > MAX_SIZE_BYTES) {
            throw InvalidRequestException(
                "Das Bild überschreitet die maximale Größe von ${MAX_SIZE_BYTES / (1024 * 1024)} MB",
                ErrorCode.INVALID_REQUEST
            )
        }

        val dimensions = readDimensions(data)
        if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
            throw InvalidRequestException(
                "Bilddimensionen dürfen höchstens ${MAX_DIMENSION}x$MAX_DIMENSION Pixel betragen",
                ErrorCode.INVALID_REQUEST
            )
        }

        // Zielobjekt auflösen und Uploadberechtigung objektbezogen prüfen.
        val targetId = resolveTargetForWrite(purpose, targetIdValue, caller, principal)

        val nextVersion = imageAssetRepository.findMaxImageVersion(purpose, targetId) + 1
        // Bisher aktuelle Bilder desselben Objekts werden als abgelöst markiert;
        // die vorherigen Versionen bleiben als Metadaten erhalten.
        imageAssetRepository.findByPurposeAndTargetIdAndStatus(purpose, targetId, ImageStatus.active)
            .forEach {
                it.status = ImageStatus.deleted
                imageAssetRepository.save(it)
            }

        val storageKey = buildStorageKey(purpose, targetId, caller.id, normalizedType)
        objectStorage.store(storageKey, data, normalizedType)

        val entity = ImageAssetEntity(
            storageKey = storageKey,
            owner = caller,
            purpose = purpose,
            targetId = targetId,
            contentType = normalizedType,
            sizeBytes = data.size.toLong(),
            width = dimensions.width,
            height = dimensions.height,
            imageVersion = nextVersion,
            status = ImageStatus.active,
            originalFilename = originalFilename?.trim()?.ifBlank { null }?.take(255)
        )
        val saved = imageAssetRepository.save(entity)
        return toDto(saved)
    }

    @Transactional(readOnly = true)
    fun getImage(id: UUID, principal: UserPrincipal): ImageAssetDto {
        val caller = userService.getOrCreateUser(principal)
        val image = requireImage(id)
        if (!canView(image, caller, principal)) {
            throw AccessDeniedException("Keine Berechtigung zum Anzeigen dieses Bildes", ErrorCode.ACCESS_DENIED)
        }
        return toDto(image)
    }

    @Transactional(readOnly = true)
    fun listImages(purposeValue: String?, targetIdValue: String?, principal: UserPrincipal): List<ImageAssetDto> {
        val caller = userService.getOrCreateUser(principal)
        val purpose = ImagePurpose.fromValue(purposeValue)
            ?: throw InvalidRequestException("Ungültiger Bildzweck: '${purposeValue.orEmpty()}'", ErrorCode.INVALID_REQUEST)
        val targetId = resolveTargetForRead(purpose, targetIdValue, caller)

        return imageAssetRepository.findByPurposeAndTargetIdAndStatus(purpose, targetId, ImageStatus.active)
            .filter { canView(it, caller, principal) }
            .sortedByDescending { it.imageVersion }
            .map { toDto(it) }
    }

    fun deleteImage(id: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val image = requireImage(id)
        if (!canDelete(image, caller, principal)) {
            throw AccessDeniedException("Keine Berechtigung zum Löschen dieses Bildes", ErrorCode.ACCESS_DENIED)
        }
        objectStorage.delete(image.storageKey)
        image.status = ImageStatus.deleted
        imageAssetRepository.save(image)
    }

    private fun requireImage(id: UUID): ImageAssetEntity =
        imageAssetRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Bild mit ID '$id' nicht gefunden", ErrorCode.NOT_FOUND)
        }

    /**
     * Löst das Zielobjekt für einen Schreibvorgang auf und prüft die
     * objektbezogene Berechtigung (`deny by default`).
     */
    private fun resolveTargetForWrite(
        purpose: ImagePurpose,
        targetIdValue: String?,
        caller: UserEntity,
        principal: UserPrincipal
    ): UUID {
        return when (purpose) {
            ImagePurpose.profile, ImagePurpose.moment -> {
                // Eigengebundene Bilder: das Ziel ist immer der Aufrufer selbst.
                if (purpose == ImagePurpose.moment && !isMemberOrHigher(caller, principal)) {
                    throw AccessDeniedException("Keine Berechtigung für Moment-Bilder", ErrorCode.ACCESS_DENIED)
                }
                caller.id
            }

            ImagePurpose.event -> {
                val eventId = requireTargetId(targetIdValue)
                val event = eventRepository.findById(eventId).orElseThrow {
                    ResourceNotFoundException("Event mit ID '$eventId' nicht gefunden", ErrorCode.NOT_FOUND)
                }
                val allowed = isBoardOrAdmin(caller, principal) || event.owner?.id == caller.id
                if (!allowed) {
                    throw AccessDeniedException(
                        "Nur der Event-Owner sowie Vorstand und Administration dürfen Eventbilder verwalten",
                        ErrorCode.ACCESS_DENIED
                    )
                }
                eventId
            }

            ImagePurpose.drink -> {
                val drinkId = requireTargetId(targetIdValue)
                val drink = drinkCatalogRepository.findById(drinkId).orElseThrow {
                    ResourceNotFoundException("Getränk mit ID '$drinkId' nicht gefunden", ErrorCode.NOT_FOUND)
                }
                val ownProposal = drink.status == DrinkStatus.proposed && drink.proposedBy?.id == caller.id
                if (!isBoardOrAdmin(caller, principal) && !ownProposal) {
                    throw AccessDeniedException(
                        "Freigegebene Getränkebilder dürfen nur Vorstand und Administration verwalten",
                        ErrorCode.ACCESS_DENIED
                    )
                }
                drinkId
            }
        }
    }

    private fun resolveTargetForRead(purpose: ImagePurpose, targetIdValue: String?, caller: UserEntity): UUID =
        when (purpose) {
            ImagePurpose.profile, ImagePurpose.moment -> parseTargetId(targetIdValue) ?: caller.id
            ImagePurpose.event, ImagePurpose.drink -> requireTargetId(targetIdValue)
        }

    private fun canView(image: ImageAssetEntity, caller: UserEntity, principal: UserPrincipal): Boolean {
        if (isBoardOrAdmin(caller, principal)) return true
        if (image.owner?.id == caller.id) return true

        return when (image.purpose) {
            ImagePurpose.profile, ImagePurpose.moment -> false
            ImagePurpose.event -> {
                val eventId = image.targetId ?: return false
                val event = eventRepository.findById(eventId).orElse(null) ?: return false
                event.owner?.id == caller.id ||
                    eventParticipantRepository.findByEventIdAndUserId(eventId, caller.id).isPresent
            }

            ImagePurpose.drink -> {
                val drinkId = image.targetId ?: return false
                val drink = drinkCatalogRepository.findById(drinkId).orElse(null) ?: return false
                // Freigegebene Getränke sind für alle Mitglieder sichtbar; sonst nur Vorschlagender/Board.
                drink.status == DrinkStatus.approved || drink.proposedBy?.id == caller.id
            }
        }
    }

    private fun canDelete(image: ImageAssetEntity, caller: UserEntity, principal: UserPrincipal): Boolean {
        if (isBoardOrAdmin(caller, principal)) return true
        if (image.owner?.id == caller.id) return true
        if (image.purpose == ImagePurpose.event) {
            val eventId = image.targetId ?: return false
            val event = eventRepository.findById(eventId).orElse(null) ?: return false
            return event.owner?.id == caller.id
        }
        return false
    }

    private fun requireTargetId(value: String?): UUID =
        parseTargetId(value) ?: throw InvalidRequestException(
            "targetId ist für diesen Bildzweck erforderlich",
            ErrorCode.INVALID_REQUEST
        )

    private fun parseTargetId(value: String?): UUID? {
        val trimmed = value?.trim()
        if (trimmed.isNullOrEmpty()) return null
        return try {
            UUID.fromString(trimmed)
        } catch (_: IllegalArgumentException) {
            throw InvalidRequestException("Ungültige Kennung für 'targetId': '$trimmed' ist keine UUID", ErrorCode.INVALID_REQUEST)
        }
    }

    private fun normalizeContentType(contentType: String?): String {
        val normalized = contentType?.trim()?.lowercase()?.substringBefore(';')?.trim()
        if (normalized.isNullOrBlank() || normalized !in ALLOWED_CONTENT_TYPES) {
            throw InvalidRequestException(
                "Nicht unterstützter Bildtyp; erlaubt sind ${ALLOWED_CONTENT_TYPES.joinToString(", ")}",
                ErrorCode.INVALID_REQUEST
            )
        }
        return normalized
    }

    private data class Dimensions(val width: Int, val height: Int)

    private fun readDimensions(data: ByteArray): Dimensions {
        val image = try {
            ImageIO.read(ByteArrayInputStream(data))
        } catch (_: Exception) {
            null
        }
        if (image == null || image.width <= 0 || image.height <= 0) {
            throw InvalidRequestException(
                "Die übertragenen Daten konnten nicht als Bild gelesen werden",
                ErrorCode.INVALID_REQUEST
            )
        }
        return Dimensions(image.width, image.height)
    }

    private fun buildStorageKey(purpose: ImagePurpose, targetId: UUID, ownerId: UUID, contentType: String): String {
        val extension = EXTENSIONS[contentType] ?: "bin"
        val scope = "$targetId".ifBlank { "$ownerId" }
        return "${purpose.name}/$scope/${UUID.randomUUID()}.$extension"
    }

    private fun isMemberOrHigher(caller: UserEntity, principal: UserPrincipal): Boolean =
        rolesOf(caller, principal).any { it == UserRole.MEMBER || it == UserRole.BOARD || it == UserRole.ADMIN }

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        rolesOf(caller, principal).any { it == UserRole.BOARD || it == UserRole.ADMIN }

    private fun rolesOf(caller: UserEntity, principal: UserPrincipal): Set<String> {
        val dbRoles = userRoleRepository.findByIdUserId(caller.id).map { it.id.role.name }
        return principal.roles + dbRoles
    }

    private fun toDto(image: ImageAssetEntity): ImageAssetDto {
        val ttl = storageProperties.urlTtl()
        val url = objectStorage.presignedGetUrl(image.storageKey, ttl)
        return ImageAssetDto(
            id = image.id.toString(),
            purpose = image.purpose.name,
            targetId = image.targetId?.toString(),
            ownerId = image.owner?.id?.toString().orEmpty(),
            contentType = image.contentType,
            sizeBytes = image.sizeBytes,
            width = image.width,
            height = image.height,
            imageVersion = image.imageVersion,
            status = image.status.name,
            originalFilename = image.originalFilename,
            url = url.toString(),
            urlExpiresInSeconds = ttl.seconds,
            createdAt = image.createdAt,
            updatedAt = image.updatedAt
        )
    }

    companion object {
        const val MAX_SIZE_BYTES = 5 * 1024 * 1024
        const val MAX_DIMENSION = 4096
        val ALLOWED_CONTENT_TYPES = setOf("image/png", "image/jpeg", "image/gif")
        private val EXTENSIONS = mapOf(
            "image/png" to "png",
            "image/jpeg" to "jpg",
            "image/gif" to "gif"
        )
    }
}
