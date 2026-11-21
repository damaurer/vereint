package de.maurer.baseservice.service

import de.maurer.baseservice.domain.MomentMediaEntity
import de.maurer.baseservice.domain.MomentMediaKind
import de.maurer.baseservice.dto.MomentMediaDto
import de.maurer.baseservice.dto.MomentMediaLimitsDto
import de.maurer.baseservice.error.*
import de.maurer.baseservice.repository.MomentMediaRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.StammtischJobs
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.io.InputStream
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Bilder und kurze Videos in Moments.
 *
 * Ausgelegt auf den kleinen Server: Videos werden nie umkodiert und nie ganz in
 * den Speicher geladen. Der Upload läuft als Strom durch die Metadaten-Bereinigung
 * ([Mp4SanitizingInputStream], entfernt u. a. den Aufnahmeort), die
 * blockweise Verschlüsselung ([DataEncryptor.encryptStream]) und direkt in den
 * Objektspeicher. Bilder (wenige MB) werden wie im Bildspeicher im Speicher
 * geprüft und von EXIF/GPS befreit, dann im selben Stromformat abgelegt.
 *
 * Absichtlich ohne Klassen-Transaktion: Ein Upload kann dauern, und dabei soll
 * keine Datenbankverbindung blockiert sein. Datenbankschritte laufen einzeln
 * über [tx].
 */
@Service
class MomentMediaService(
    private val momentService: MomentService,
    private val momentMediaRepository: MomentMediaRepository,
    private val userRepository: UserRepository,
    private val mediaStore: MediaStore,
    private val auditService: AuditService,
    private val stammtischJobs: StammtischJobs,
    transactionManager: PlatformTransactionManager
) {

    private val log = LoggerFactory.getLogger(MomentMediaService::class.java)
    private val tx = TransactionTemplate(transactionManager)

    /**
     * Nimmt ein Bild oder Video entgegen. Die Datei gehört danach noch zu keinem
     * Beitrag; sie wird mit dem nächsten Beitrag des Mitglieds (`mediaIds`)
     * sichtbar.
     */
    fun upload(
        momentId: UUID,
        contentTypeHeader: String?,
        contentLength: Long,
        body: InputStream,
        principal: UserPrincipal
    ): MomentMediaDto {
        val (kind, contentType) = mediaStore.kindOf(contentTypeHeader)
        mediaStore.requireLength(kind, contentLength)

        val ownerId = tx.execute {
            val access = momentService.requireMomentAccess(momentId, principal, requireActive = true)
            val count = momentMediaRepository.countByMomentIdAndOwnerId(momentId, access.caller.id)
            if (count >= MAX_MEDIA_PER_MEMBER_AND_MOMENT) {
                throw InvalidRequestException(
                    Msg("error.momentMedia.memberLimit", MAX_MEDIA_PER_MEMBER_AND_MOMENT),
                    ErrorCode.INVALID_REQUEST
                )
            }
            access.caller.id
        }!!

        val storageKey = "moment/$momentId/${UUID.randomUUID()}.bin"
        val stored = mediaStore.store(storageKey, kind, contentType, contentLength, body)

        return try {
            tx.execute {
                val access = momentService.requireMomentAccess(momentId, principal, requireActive = false)
                val entity = momentMediaRepository.save(
                    MomentMediaEntity(
                        moment = access.session,
                        owner = userRepository.getReferenceById(ownerId),
                        kind = kind,
                        contentType = stored.contentType,
                        sizeBytes = stored.sizeBytes,
                        storageKey = storageKey,
                        encrypted = mediaStore.encrypting,
                        width = stored.width,
                        height = stored.height,
                        durationMs = stored.durationMs
                    )
                )
                MomentService.toMediaDto(entity, access.caller, access.canModerate)
            }!!
        } catch (e: RuntimeException) {
            mediaStore.delete(storageKey)
            throw e
        }
    }

    /** Prüft die Berechtigung und liefert, was zum Ausliefern der Datei nötig ist. */
    fun prepareContent(momentId: UUID, mediaId: UUID, principal: UserPrincipal): MediaContent =
        tx.execute {
            val access = momentService.requireMomentAccess(momentId, principal, requireActive = false)
            val media = requireMedia(mediaId, momentId)
            // Noch nicht abgesendete Uploads sieht nur der Eigentümer (Vorschau).
            if (media.response == null && media.owner?.id != access.caller.id) {
                throw ResourceNotFoundException(Msg("error.momentMedia.notFound", mediaId), ErrorCode.NOT_FOUND)
            }
            MediaContent(media.storageKey, media.sizeBytes, media.encrypted, media.contentType)
        }!!

    /** Öffnet die Bytes [start] bis [endInclusive] der entschlüsselten Datei. */
    fun openRange(content: MediaContent, start: Long, endInclusive: Long): InputStream =
        mediaStore.openRange(content, start, endInclusive)

    /** Entfernt eine Datei (Eigentümer, Event-Owner, Vorstand/Admin). */
    fun delete(momentId: UUID, mediaId: UUID, principal: UserPrincipal) {
        val storageKey = tx.execute {
            val access = momentService.requireMomentAccess(momentId, principal, requireActive = false)
            val media = requireMedia(mediaId, momentId)
            val own = media.owner?.id == access.caller.id
            if (!own && !(access.canModerate && media.response != null)) {
                throw AccessDeniedException(Msg("error.momentMedia.deleteDenied"), ErrorCode.ACCESS_DENIED)
            }
            if (!own) {
                auditService.recordMomentAction(
                    actor = access.caller,
                    action = AuditService.ACTION_MOMENT_MEDIA_REMOVED,
                    momentId = momentId,
                    details = "kind=${media.kind.name}; owner=${media.owner?.displayName}"
                )
            }
            momentMediaRepository.delete(media)
            media.storageKey
        }!!
        mediaStore.delete(storageKey)
    }

    /** Löscht Uploads, die nie zu einem Beitrag wurden (abgebrochene Beiträge), in jedem Stammtisch. */
    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT10M")
    fun removeAbandonedUploadsEverywhere() {
        stammtischJobs.forEachStammtisch("moment-media-cleanup") { removeAbandonedUploads() }
    }

    fun removeAbandonedUploads() {
        val cutoff = Instant.now().minus(ABANDONED_AFTER)
        val keys = tx.execute {
            val abandoned = momentMediaRepository.findByResponseIsNullAndCreatedAtBefore(cutoff)
            momentMediaRepository.deleteAll(abandoned)
            abandoned.map { it.storageKey }
        }.orEmpty()
        keys.forEach { key ->
            try {
                mediaStore.delete(key)
            } catch (e: RuntimeException) {
                log.warn("Verwaister Moment-Upload '{}' konnte nicht gelöscht werden: {}", key, e.message)
            }
        }
        if (keys.isNotEmpty()) log.info("{} nicht verwendete Moment-Uploads entfernt", keys.size)
    }

    private fun requireMedia(mediaId: UUID, momentId: UUID): MomentMediaEntity {
        val media = momentMediaRepository.findById(mediaId).orElse(null)
        if (media == null || media.moment?.id != momentId) {
            throw ResourceNotFoundException(Msg("error.momentMedia.notFound", mediaId), ErrorCode.NOT_FOUND)
        }
        return media
    }

    companion object {
        const val MAX_IMAGE_BYTES = MediaStore.MAX_IMAGE_BYTES
        const val MAX_VIDEO_BYTES = MediaStore.MAX_VIDEO_BYTES
        const val MAX_VIDEO_SECONDS = MediaStore.MAX_VIDEO_SECONDS
        const val MAX_MEDIA_PER_RESPONSE = 4
        const val MAX_MEDIA_PER_MEMBER_AND_MOMENT = 40
        private val ABANDONED_AFTER: Duration = Duration.ofHours(6)
        val IMAGE_TYPES = MediaStore.IMAGE_TYPES
        val VIDEO_TYPES = MediaStore.VIDEO_TYPES

        fun limits() = MomentMediaLimitsDto(
            maxImageBytes = MAX_IMAGE_BYTES,
            maxVideoBytes = MAX_VIDEO_BYTES,
            maxVideoSeconds = MAX_VIDEO_SECONDS,
            maxMediaPerResponse = MAX_MEDIA_PER_RESPONSE,
            imageTypes = IMAGE_TYPES,
            videoTypes = VIDEO_TYPES
        )
    }
}

