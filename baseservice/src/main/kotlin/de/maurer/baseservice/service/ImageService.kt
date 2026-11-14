package de.maurer.baseservice.service

import de.maurer.baseservice.crypto.DataEncryptor
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.ImageAssetEntity
import de.maurer.baseservice.domain.ImagePurpose
import de.maurer.baseservice.domain.ImageStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.ImageAssetDto
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.ImageAssetRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.storage.ObjectStorage
import de.maurer.baseservice.support.ImageMetadata
import de.maurer.baseservice.tenancy.StammtischAccess
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
 * Eigentümer, Zweck, Version, Status). Die Bilddaten werden vor dem Ablegen mit
 * dem [DataEncryptor] verschlüsselt; ausgeliefert werden sie deshalb nur über
 * [getImageContent], das die Berechtigung erneut prüft und entschlüsselt (siehe
 * `docs/baseservice/06-integrations.md`).
 */
@Service
@Transactional
class ImageService(
    private val imageAssetRepository: ImageAssetRepository,
    private val objectStorage: ObjectStorage,
    private val dataEncryptor: DataEncryptor,
    private val userService: UserService,
    private val access: StammtischAccess,
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
            ?: throw InvalidRequestException(Msg("error.image.invalidPurpose", purposeValue.orEmpty()), ErrorCode.INVALID_REQUEST)

        val normalizedType = normalizeContentType(contentType)
        if (data.isEmpty()) {
            throw InvalidRequestException(Msg("error.image.noData"), ErrorCode.INVALID_REQUEST)
        }
        if (data.size > MAX_SIZE_BYTES) {
            throw InvalidRequestException(
                Msg("error.image.tooLarge", MAX_SIZE_BYTES / (1024 * 1024)),
                ErrorCode.INVALID_REQUEST
            )
        }

        val dimensions = readDimensions(data)
        // GPS-Standort, Gerätedaten usw. verlassen nie den Server.
        val cleaned = try {
            ImageMetadata.strip(data)
        } catch (_: IllegalArgumentException) {
            throw InvalidRequestException(Msg("error.image.unreadable"), ErrorCode.INVALID_REQUEST)
        }
        if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
            throw InvalidRequestException(
                Msg("error.image.dimensionsTooLarge", MAX_DIMENSION, MAX_DIMENSION),
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
        // Verschlüsselte Objekte sind für S3 opake Binärdaten; der eigentliche
        // Bildtyp steht in den Metadaten.
        val storedType = if (dataEncryptor.enabled) ENCRYPTED_CONTENT_TYPE else normalizedType
        objectStorage.store(storageKey, dataEncryptor.encrypt(cleaned), storedType)

        val entity = ImageAssetEntity(
            storageKey = storageKey,
            owner = caller,
            purpose = purpose,
            targetId = targetId,
            contentType = normalizedType,
            sizeBytes = cleaned.size.toLong(),
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
            throw AccessDeniedException(Msg("error.image.viewDenied"), ErrorCode.ACCESS_DENIED)
        }
        return toDto(image)
    }

    /** Liefert die entschlüsselten Bilddaten für berechtigte Benutzer. */
    @Transactional(readOnly = true)
    fun getImageContent(id: UUID, principal: UserPrincipal): ImageContent {
        val caller = userService.getOrCreateUser(principal)
        val image = requireImage(id)
        if (image.status != ImageStatus.active) {
            throw ResourceNotFoundException(Msg("error.image.notFound", id), ErrorCode.NOT_FOUND)
        }
        if (!canView(image, caller, principal)) {
            throw AccessDeniedException(Msg("error.image.viewDenied"), ErrorCode.ACCESS_DENIED)
        }
        val stored = objectStorage.read(image.storageKey)
            ?: throw ResourceNotFoundException(Msg("error.image.dataNotFound", id), ErrorCode.NOT_FOUND)
        return ImageContent(dataEncryptor.decrypt(stored), image.contentType)
    }

    @Transactional(readOnly = true)
    fun listImages(purposeValue: String?, targetIdValue: String?, principal: UserPrincipal): List<ImageAssetDto> {
        val caller = userService.getOrCreateUser(principal)
        val purpose = ImagePurpose.fromValue(purposeValue)
            ?: throw InvalidRequestException(Msg("error.image.invalidPurpose", purposeValue.orEmpty()), ErrorCode.INVALID_REQUEST)
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
            throw AccessDeniedException(Msg("error.image.deleteDenied"), ErrorCode.ACCESS_DENIED)
        }
        objectStorage.delete(image.storageKey)
        image.status = ImageStatus.deleted
        imageAssetRepository.save(image)
    }

    private fun requireImage(id: UUID): ImageAssetEntity =
        imageAssetRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.image.notFound", id), ErrorCode.NOT_FOUND)
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
                    throw AccessDeniedException(Msg("error.image.momentDenied"), ErrorCode.ACCESS_DENIED)
                }
                caller.id
            }

            ImagePurpose.event -> {
                val eventId = requireTargetId(targetIdValue)
                val event = eventRepository.findById(eventId).orElseThrow {
                    ResourceNotFoundException(Msg("error.event.notFound", eventId), ErrorCode.NOT_FOUND)
                }
                val allowed = isBoardOrAdmin(caller, principal) || event.owner?.id == caller.id
                if (!allowed) {
                    throw AccessDeniedException(
                        Msg("error.image.eventManageDenied"),
                        ErrorCode.ACCESS_DENIED
                    )
                }
                eventId
            }

            ImagePurpose.drink -> {
                val drinkId = requireTargetId(targetIdValue)
                val drink = drinkCatalogRepository.findById(drinkId).orElseThrow {
                    ResourceNotFoundException(Msg("error.drink.notFound", drinkId), ErrorCode.NOT_FOUND)
                }
                val ownProposal = drink.status == DrinkStatus.proposed && drink.proposedBy?.id == caller.id
                if (!isBoardOrAdmin(caller, principal) && !ownProposal) {
                    throw AccessDeniedException(
                        Msg("error.image.approvedDrinkManageDenied"),
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
            Msg("error.image.targetIdRequired"),
            ErrorCode.INVALID_REQUEST
        )

    private fun parseTargetId(value: String?): UUID? {
        val trimmed = value?.trim()
        if (trimmed.isNullOrEmpty()) return null
        return try {
            UUID.fromString(trimmed)
        } catch (_: IllegalArgumentException) {
            throw InvalidRequestException(Msg("error.field.invalidUuid", "targetId", trimmed), ErrorCode.INVALID_REQUEST)
        }
    }

    private fun normalizeContentType(contentType: String?): String {
        val normalized = contentType?.trim()?.lowercase()?.substringBefore(';')?.trim()
        if (normalized.isNullOrBlank() || normalized !in ALLOWED_CONTENT_TYPES) {
            throw InvalidRequestException(
                Msg("error.image.unsupportedType", ALLOWED_CONTENT_TYPES.joinToString(", ")),
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
                Msg("error.image.unreadable"),
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
        access.isMember(principal, caller)

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        access.hasAny(principal, caller, Permission.EVENT_MANAGE, Permission.CATALOG_APPROVE)


    private fun toDto(image: ImageAssetEntity): ImageAssetDto {
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
            url = "/api/v1/images/${image.id}/content",
            // Die Inhalts-URL ist an die Sitzung gebunden und läuft nicht ab.
            urlExpiresInSeconds = 0,
            createdAt = image.createdAt,
            updatedAt = image.updatedAt
        )
    }

    companion object {
        const val MAX_SIZE_BYTES = 5 * 1024 * 1024
        const val MAX_DIMENSION = 4096
        const val ENCRYPTED_CONTENT_TYPE = "application/octet-stream"
        val ALLOWED_CONTENT_TYPES = setOf("image/png", "image/jpeg", "image/gif")
        private val EXTENSIONS = mapOf(
            "image/png" to "png",
            "image/jpeg" to "jpg",
            "image/gif" to "gif"
        )
    }
}

class ImageContent(val data: ByteArray, val contentType: String)
