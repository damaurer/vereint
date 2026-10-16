package de.maurer.baseservice.service

import de.maurer.baseservice.crypto.DataEncryptor
import de.maurer.baseservice.domain.MomentMediaEntity
import de.maurer.baseservice.domain.MomentMediaKind
import de.maurer.baseservice.dto.MomentMediaDto
import de.maurer.baseservice.dto.MomentMediaLimitsDto
import de.maurer.baseservice.error.*
import de.maurer.baseservice.repository.MomentMediaRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.storage.ObjectStorage
import de.maurer.baseservice.support.ImageMetadata
import de.maurer.baseservice.support.InvalidVideoException
import de.maurer.baseservice.support.Mp4SanitizingInputStream
import de.maurer.baseservice.support.VideoTooLongException
import de.maurer.baseservice.tenancy.StammtischJobs
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.imageio.ImageIO

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
    private val objectStorage: ObjectStorage,
    private val dataEncryptor: DataEncryptor,
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
        eventId: UUID,
        momentId: UUID,
        contentTypeHeader: String?,
        contentLength: Long,
        body: InputStream,
        principal: UserPrincipal
    ): MomentMediaDto {
        val contentType = contentTypeHeader?.trim()?.lowercase()?.substringBefore(';')?.trim().orEmpty()
        val kind = when (contentType) {
            in IMAGE_TYPES -> MomentMediaKind.image
            in VIDEO_TYPES -> MomentMediaKind.video
            else -> throw InvalidRequestException(
                Msg("error.momentMedia.unsupportedType", (IMAGE_TYPES + VIDEO_TYPES).joinToString(", ")),
                ErrorCode.INVALID_REQUEST
            )
        }
        if (contentLength <= 0) {
            throw InvalidRequestException(Msg("error.momentMedia.lengthRequired"), ErrorCode.INVALID_REQUEST)
        }
        val maxBytes = if (kind == MomentMediaKind.image) MAX_IMAGE_BYTES else MAX_VIDEO_BYTES
        if (contentLength > maxBytes) {
            throw ApiException(
                ErrorCode.MEDIA_TOO_LARGE,
                Msg("error.momentMedia.tooLarge", maxBytes / (1024 * 1024)),
                HttpStatus.PAYLOAD_TOO_LARGE
            )
        }

        val ownerId = tx.execute {
            val access = momentService.requireMomentAccess(eventId, momentId, principal, requireActive = true)
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
        val exact = ExactLengthInputStream(body, contentLength)
        val stored = when (kind) {
            MomentMediaKind.image -> storeImage(storageKey, exact, contentType)
            MomentMediaKind.video -> storeVideo(storageKey, exact, contentLength)
        }

        return try {
            tx.execute {
                val access = momentService.requireMomentAccess(eventId, momentId, principal, requireActive = false)
                val entity = momentMediaRepository.save(
                    MomentMediaEntity(
                        moment = access.session,
                        owner = userRepository.getReferenceById(ownerId),
                        kind = kind,
                        contentType = stored.contentType,
                        sizeBytes = stored.sizeBytes,
                        storageKey = storageKey,
                        encrypted = dataEncryptor.enabled,
                        width = stored.width,
                        height = stored.height,
                        durationMs = stored.durationMs
                    )
                )
                MomentService.toMediaDto(entity, eventId, access.caller, access.canModerate)
            }!!
        } catch (e: RuntimeException) {
            objectStorage.delete(storageKey)
            throw e
        }
    }

    /** Prüft die Berechtigung und liefert, was zum Ausliefern der Datei nötig ist. */
    fun prepareContent(eventId: UUID, momentId: UUID, mediaId: UUID, principal: UserPrincipal): MediaContent =
        tx.execute {
            val access = momentService.requireMomentAccess(eventId, momentId, principal, requireActive = false)
            val media = requireMedia(mediaId, momentId)
            // Noch nicht abgesendete Uploads sieht nur der Eigentümer (Vorschau).
            if (media.response == null && media.owner?.id != access.caller.id) {
                throw ResourceNotFoundException(Msg("error.momentMedia.notFound", mediaId), ErrorCode.NOT_FOUND)
            }
            MediaContent(media.storageKey, media.sizeBytes, media.encrypted, media.contentType)
        }!!

    /**
     * Öffnet die Bytes [start] bis [endInclusive] der entschlüsselten Datei.
     * Liest nur die nötigen verschlüsselten Blöcke aus dem Objektspeicher.
     */
    fun openRange(content: MediaContent, start: Long, endInclusive: Long): InputStream {
        require(start in 0..endInclusive && endInclusive < content.sizeBytes) { "Ungültiger Bereich" }
        if (!content.encrypted) {
            return objectStorage.readRange(content.storageKey, start, endInclusive) ?: throw missing(content)
        }
        val chunkSize = DataEncryptor.STREAM_CHUNK_SIZE.toLong()
        val firstChunk = start / chunkSize
        val lastChunk = endInclusive / chunkSize
        val header = objectStorage.readRange(content.storageKey, 0, DataEncryptor.STREAM_HEADER_LENGTH - 1L)
            ?.use { it.readAllBytes() } ?: throw missing(content)
        val encryptedEnd = minOf(
            dataEncryptor.streamChunkOffset(lastChunk + 1),
            dataEncryptor.encryptedStreamLength(content.sizeBytes)
        ) - 1
        val chunks = objectStorage.readRange(content.storageKey, dataEncryptor.streamChunkOffset(firstChunk), encryptedEnd)
            ?: throw missing(content)
        val plain = dataEncryptor.decryptStreamChunks(header, chunks, content.sizeBytes, firstChunk, lastChunk)
        plain.skipNBytes(start - firstChunk * chunkSize)
        return BoundedInputStream(plain, endInclusive - start + 1)
    }

    /** Entfernt eine Datei (Eigentümer, Event-Owner, Vorstand/Admin). */
    fun delete(eventId: UUID, momentId: UUID, mediaId: UUID, principal: UserPrincipal) {
        val storageKey = tx.execute {
            val access = momentService.requireMomentAccess(eventId, momentId, principal, requireActive = false)
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
        objectStorage.delete(storageKey)
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
                objectStorage.delete(key)
            } catch (e: RuntimeException) {
                log.warn("Verwaister Moment-Upload '{}' konnte nicht gelöscht werden: {}", key, e.message)
            }
        }
        if (keys.isNotEmpty()) log.info("{} nicht verwendete Moment-Uploads entfernt", keys.size)
    }

    private fun storeImage(storageKey: String, body: InputStream, contentType: String): StoredMedia {
        val data = readFully(body)
        val (width, height) = readDimensions(data, contentType)
            ?: throw InvalidRequestException(Msg("error.image.unreadable"), ErrorCode.INVALID_REQUEST)
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
            throw InvalidRequestException(
                Msg("error.image.dimensionsTooLarge", MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION),
                ErrorCode.INVALID_REQUEST
            )
        }
        // GPS-Standort, Gerätedaten usw. verlassen nie den Server.
        val cleaned = try {
            ImageMetadata.strip(data)
        } catch (_: IllegalArgumentException) {
            throw InvalidRequestException(Msg("error.image.unreadable"), ErrorCode.INVALID_REQUEST)
        }
        val length = cleaned.size.toLong()
        objectStorage.storeStream(
            storageKey,
            dataEncryptor.encryptStream(ByteArrayInputStream(cleaned), length),
            storedLength(length),
            STORED_CONTENT_TYPE
        )
        return StoredMedia(contentType, length, width, height, null)
    }

    private fun storeVideo(storageKey: String, body: InputStream, length: Long): StoredMedia {
        val sanitized = Mp4SanitizingInputStream(body, maxDurationMillis = MAX_VIDEO_SECONDS * 1000L + DURATION_TOLERANCE_MS)
        try {
            objectStorage.storeStream(
                storageKey,
                dataEncryptor.encryptStream(sanitized, length),
                storedLength(length),
                STORED_CONTENT_TYPE
            )
        } catch (e: Exception) {
            // Teilweise geschriebene Objekte sind bei S3 ohnehin verworfen; sicher ist sicher.
            runCatching { objectStorage.delete(storageKey) }
            throw translateUploadFailure(e)
        }
        return StoredMedia(VIDEO_CONTENT_TYPE, length, null, null, sanitized.durationMillis)
    }

    private fun translateUploadFailure(e: Exception): RuntimeException {
        var cause: Throwable? = e
        while (cause != null) {
            when (cause) {
                is VideoTooLongException -> return ApiException(
                    ErrorCode.VIDEO_TOO_LONG,
                    Msg("error.momentMedia.videoTooLong", MAX_VIDEO_SECONDS),
                    HttpStatus.BAD_REQUEST
                )
                is InvalidVideoException -> return InvalidRequestException(Msg("error.momentMedia.invalidVideo"), ErrorCode.INVALID_REQUEST)
                is IncompleteUploadException -> return InvalidRequestException(Msg("error.momentMedia.incomplete"), ErrorCode.INVALID_REQUEST)
            }
            cause = cause.cause
        }
        return if (e is RuntimeException) e else IllegalStateException("Upload fehlgeschlagen", e)
    }

    /**
     * Liest nur den Bildkopf (Format und Größe), ohne das Bild zu dekodieren;
     * ein dekodiertes Handyfoto bräuchte ein Vielfaches an Arbeitsspeicher.
     */
    private fun readDimensions(data: ByteArray, contentType: String): Pair<Int, Int>? {
        val input = ImageIO.createImageInputStream(ByteArrayInputStream(data)) ?: return null
        input.use {
            val reader = ImageIO.getImageReaders(it).asSequence().firstOrNull() ?: return null
            try {
                val mime = reader.originatingProvider?.mimeTypes.orEmpty().map { m -> m.lowercase() }
                if (contentType !in mime) return null
                reader.input = it
                val width = reader.getWidth(0)
                val height = reader.getHeight(0)
                return if (width > 0 && height > 0) width to height else null
            } catch (_: Exception) {
                return null
            } finally {
                reader.dispose()
            }
        }
    }

    private fun readFully(body: InputStream): ByteArray = try {
        body.readAllBytes()
    } catch (_: IncompleteUploadException) {
        throw InvalidRequestException(Msg("error.momentMedia.incomplete"), ErrorCode.INVALID_REQUEST)
    }

    private fun storedLength(plainLength: Long): Long =
        if (dataEncryptor.enabled) dataEncryptor.encryptedStreamLength(plainLength) else plainLength

    private fun requireMedia(mediaId: UUID, momentId: UUID): MomentMediaEntity {
        val media = momentMediaRepository.findById(mediaId).orElse(null)
        if (media == null || media.moment?.id != momentId) {
            throw ResourceNotFoundException(Msg("error.momentMedia.notFound", mediaId), ErrorCode.NOT_FOUND)
        }
        return media
    }

    private fun missing(content: MediaContent) =
        ResourceNotFoundException(Msg("error.momentMedia.dataNotFound"), ErrorCode.NOT_FOUND)
            .also { log.warn("Moment-Datei '{}' fehlt im Objektspeicher", content.storageKey) }

    private class StoredMedia(
        val contentType: String,
        val sizeBytes: Long,
        val width: Int?,
        val height: Int?,
        val durationMs: Long?
    )

    companion object {
        const val MAX_IMAGE_BYTES = 10L * 1024 * 1024
        const val MAX_VIDEO_BYTES = 100L * 1024 * 1024
        const val MAX_VIDEO_SECONDS = 60
        const val MAX_MEDIA_PER_RESPONSE = 4
        const val MAX_MEDIA_PER_MEMBER_AND_MOMENT = 40
        const val MAX_IMAGE_DIMENSION = 8192
        private const val DURATION_TOLERANCE_MS = 1000L
        private const val STORED_CONTENT_TYPE = "application/octet-stream"
        /** MP4 und MOV sind beide ISO-BMFF; Browser spielen MOV als MP4 ab. */
        private const val VIDEO_CONTENT_TYPE = "video/mp4"
        private val ABANDONED_AFTER: Duration = Duration.ofHours(6)
        val IMAGE_TYPES = listOf("image/jpeg", "image/png", "image/gif")
        val VIDEO_TYPES = listOf("video/mp4", "video/quicktime")

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

/** Alles, was zum Ausliefern einer Moment-Datei nötig ist. */
class MediaContent(val storageKey: String, val sizeBytes: Long, val encrypted: Boolean, val contentType: String)

/** Der Upload endete vor der angekündigten Länge. */
class IncompleteUploadException : IOException("Upload ist unvollständig")

/** Liefert genau [length] Byte aus [source]; endet [source] früher, ist der Upload unvollständig. */
private class ExactLengthInputStream(private val source: InputStream, private var remaining: Long) : InputStream() {
    override fun read(): Int {
        if (remaining <= 0) return -1
        val b = source.read()
        if (b == -1) throw IncompleteUploadException()
        remaining--
        return b
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        if (len == 0) return 0
        if (remaining <= 0) return -1
        val n = source.read(b, off, minOf(len.toLong(), remaining).toInt())
        if (n == -1) throw IncompleteUploadException()
        remaining -= n
        return n
    }
}

/** Liefert höchstens [remaining] Byte aus [source]. */
private class BoundedInputStream(private val source: InputStream, private var remaining: Long) : InputStream() {
    override fun read(): Int {
        if (remaining <= 0) return -1
        val b = source.read()
        if (b != -1) remaining--
        return b
    }

    override fun read(b: ByteArray, off: Int, len: Int): Int {
        if (len == 0) return 0
        if (remaining <= 0) return -1
        val n = source.read(b, off, minOf(len.toLong(), remaining).toInt())
        if (n > 0) remaining -= n
        return n
    }

    override fun close() = source.close()
}
