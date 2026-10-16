package de.maurer.baseservice.service

import de.maurer.baseservice.crypto.DataEncryptor
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.storage.ObjectStorage
import de.maurer.baseservice.support.ImageMetadata
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.StammtischMemberships
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.springframework.stereotype.Service
import java.io.ByteArrayInputStream
import java.util.UUID
import javax.imageio.ImageIO

/**
 * Bild, das eine Gruppe (Stammtisch) repräsentiert. Hochladen und entfernen
 * darf, wer die Gruppe verwalten darf (`stammtisch.manage`, beim Eröffnen die
 * eröffnende Person). Sehen dürfen es alle Mitglieder der Gruppe, auch wenn
 * gerade eine andere Gruppe gewählt ist (Gruppenauswahl).
 *
 * Wie alle Bilder liegt es verschlüsselt und ohne Metadaten (EXIF, GPS) im
 * Objektspeicher und wird nur über [content] mit Berechtigungsprüfung
 * ausgeliefert.
 */
@Service
class GroupImageService(
    private val stammtischRepository: StammtischRepository,
    private val objectStorage: ObjectStorage,
    private val dataEncryptor: DataEncryptor,
    private val userService: UserService,
    private val access: StammtischAccess,
    private val memberships: StammtischMemberships,
    private val auditService: AuditService,
    private val tenantTransactions: TenantTransactions
) {

    class Content(val data: ByteArray, val contentType: String)

    fun upload(contentType: String?, data: ByteArray, principal: UserPrincipal): Int {
        val caller = userService.getOrCreateUser(principal)
        if (!access.has(principal, caller, Permission.STAMMTISCH_MANAGE)) {
            throw AccessDeniedException(Msg("error.stammtisch.manageDenied"), ErrorCode.ACCESS_DENIED)
        }
        val type = contentType?.trim()?.lowercase()?.substringBefore(';')?.trim()
        if (type == null || type !in ImageService.ALLOWED_CONTENT_TYPES) {
            throw InvalidRequestException(
                Msg("error.image.unsupportedType", ImageService.ALLOWED_CONTENT_TYPES.joinToString(", ")),
                ErrorCode.INVALID_REQUEST
            )
        }
        if (data.isEmpty() || data.size > ImageService.MAX_SIZE_BYTES) {
            throw InvalidRequestException(
                Msg("error.image.tooLarge", ImageService.MAX_SIZE_BYTES / (1024 * 1024)),
                ErrorCode.INVALID_REQUEST
            )
        }
        val image = runCatching { ImageIO.read(ByteArrayInputStream(data)) }.getOrNull()
            ?: throw InvalidRequestException(Msg("error.image.unreadable"), ErrorCode.INVALID_REQUEST)
        if (image.width > ImageService.MAX_DIMENSION || image.height > ImageService.MAX_DIMENSION) {
            throw InvalidRequestException(
                Msg("error.image.dimensionsTooLarge", ImageService.MAX_DIMENSION, ImageService.MAX_DIMENSION),
                ErrorCode.INVALID_REQUEST
            )
        }
        val cleaned = try {
            ImageMetadata.strip(data)
        } catch (_: IllegalArgumentException) {
            throw InvalidRequestException(Msg("error.image.unreadable"), ErrorCode.INVALID_REQUEST)
        }

        val stammtischId = TenantContext.requireStammtischId()
        val key = "group/$stammtischId/${UUID.randomUUID()}.bin"
        objectStorage.store(key, dataEncryptor.encrypt(cleaned), ImageService.ENCRYPTED_CONTENT_TYPE)
        val (previousKey, version) = tenantTransactions.asSystem {
            val stammtisch = stammtischRepository.findById(stammtischId).orElseThrow()
            val previous = stammtisch.imageKey
            stammtisch.imageKey = key
            stammtisch.imageContentType = type
            stammtisch.imageVersion += 1
            stammtischRepository.saveAndFlush(stammtisch)
            previous to stammtisch.imageVersion
        }
        previousKey?.let { runCatching { objectStorage.delete(it) } }
        tenantTransactions.inStammtisch(stammtischId) {
            auditService.recordStammtischChange(caller, AuditService.ACTION_STAMMTISCH_IMAGE_CHANGED, stammtischId, "image=v$version")
        }
        return version
    }

    fun delete(principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        if (!access.has(principal, caller, Permission.STAMMTISCH_MANAGE)) {
            throw AccessDeniedException(Msg("error.stammtisch.manageDenied"), ErrorCode.ACCESS_DENIED)
        }
        val stammtischId = TenantContext.requireStammtischId()
        val previousKey = tenantTransactions.asSystem {
            val stammtisch = stammtischRepository.findById(stammtischId).orElseThrow()
            val previous = stammtisch.imageKey
            stammtisch.imageKey = null
            stammtisch.imageContentType = null
            stammtischRepository.saveAndFlush(stammtisch)
            previous
        }
        previousKey?.let { runCatching { objectStorage.delete(it) } }
    }

    /** Bild einer Gruppe, in der die Person Mitglied ist (Plattform-Admins: alle). */
    fun content(stammtischId: UUID, principal: UserPrincipal): Content {
        val caller = TenantContext.runWithoutTenant { userService.getOrCreateUser(principal) }
        val member = memberships.memberships(caller.id).any { it.stammtischId == stammtischId }
        if (!member && !principal.platformAdmin) {
            throw AccessDeniedException(Msg("error.stammtisch.accessDenied"), ErrorCode.STAMMTISCH_ACCESS_DENIED)
        }
        val stammtisch = tenantTransactions.readAsSystem { stammtischRepository.findById(stammtischId).orElse(null) }
        val key = stammtisch?.imageKey ?: throw notFound()
        val stored = objectStorage.read(key) ?: throw notFound()
        return Content(dataEncryptor.decrypt(stored), stammtisch.imageContentType ?: "image/jpeg")
    }

    private fun notFound() = ResourceNotFoundException(Msg("error.stammtisch.imageNotFound"), ErrorCode.NOT_FOUND)
}
