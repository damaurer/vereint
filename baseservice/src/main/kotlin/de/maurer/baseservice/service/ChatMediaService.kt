package de.maurer.baseservice.service

import de.maurer.baseservice.domain.ChatMediaEntity
import de.maurer.baseservice.domain.DirectMediaEntity
import de.maurer.baseservice.dto.ChatMediaDto
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.ChatMediaRepository
import de.maurer.baseservice.repository.DirectMediaRepository
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
 * Fotos und kurze Videos in Chats, mit denselben Grenzen und derselben
 * Verschlüsselung wie bei Moments ([MediaStore]).
 *
 * Ablauf: Die App lädt jede Datei einzeln hoch (`POST …/media`, roher Körper),
 * erhält eine Id und schickt die Ids mit der Nachricht (`mediaIds`). Bis dahin
 * sieht nur der Eigentümer die Datei. Nicht gesendete Uploads räumt ein Job weg.
 *
 * Gruppen-, Event- und Moment-Chats folgen den Leserechten ihres Chats,
 * Direktnachrichten den beiden Beteiligten.
 *
 * Absichtlich ohne Klassen-Transaktion: Ein Upload kann dauern, und dabei soll
 * keine Datenbankverbindung blockiert sein.
 */
@Service
class ChatMediaService(
    private val chatService: ChatService,
    private val directMessageService: DirectMessageService,
    private val userService: UserService,
    private val chatMediaRepository: ChatMediaRepository,
    private val directMediaRepository: DirectMediaRepository,
    private val mediaStore: MediaStore,
    private val stammtischJobs: StammtischJobs,
    transactionManager: PlatformTransactionManager
) {

    private val log = LoggerFactory.getLogger(ChatMediaService::class.java)
    private val tx = TransactionTemplate(transactionManager)

    // --- Gruppen-, Event- und Moment-Chats ---

    fun uploadGroup(
        conversationId: UUID,
        contentTypeHeader: String?,
        contentLength: Long,
        body: InputStream,
        principal: UserPrincipal
    ): ChatMediaDto {
        val (kind, contentType) = mediaStore.kindOf(contentTypeHeader)
        mediaStore.requireLength(kind, contentLength)
        val ownerId = tx.execute {
            val caller = userService.getOrCreateUser(principal)
            val conversation = chatService.requireReadableConversation(conversationId, caller, principal)
            chatService.requireConversationOpen(conversation)
            requirePendingBelowLimit(chatMediaRepository.countByConversationIdAndOwnerIdAndMessageIdIsNull(conversationId, caller.id))
            caller.id
        }!!
        val storageKey = "chat/$conversationId/${UUID.randomUUID()}.bin"
        val stored = mediaStore.store(storageKey, kind, contentType, contentLength, body)
        return try {
            tx.execute {
                val entity = chatMediaRepository.save(
                    ChatMediaEntity(
                        conversationId = conversationId,
                        ownerId = ownerId,
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
                ChatMediaAttachments.groupDto(entity)
            }!!
        } catch (e: RuntimeException) {
            mediaStore.delete(storageKey)
            throw e
        }
    }

    fun prepareGroupContent(conversationId: UUID, mediaId: UUID, principal: UserPrincipal): MediaContent =
        tx.execute {
            val caller = userService.getOrCreateUser(principal)
            chatService.requireReadableConversation(conversationId, caller, principal)
            val media = chatMediaRepository.findById(mediaId).orElse(null)
                ?.takeIf { it.conversationId == conversationId && (it.messageId != null || it.ownerId == caller.id) }
                ?: throw notFound(mediaId)
            MediaContent(media.storageKey, media.sizeBytes, media.encrypted, media.contentType)
        }!!

    // --- Direktnachrichten ---

    fun uploadDirect(
        conversationId: UUID,
        contentTypeHeader: String?,
        contentLength: Long,
        body: InputStream,
        principal: UserPrincipal
    ): ChatMediaDto {
        val (kind, contentType) = mediaStore.kindOf(contentTypeHeader)
        mediaStore.requireLength(kind, contentLength)
        val ownerId = tx.execute {
            val caller = userService.getOrCreateUser(principal)
            directMessageService.requireWritableDirect(conversationId, caller)
            requirePendingBelowLimit(directMediaRepository.countByConversationIdAndOwnerIdAndMessageIdIsNull(conversationId, caller.id))
            caller.id
        }!!
        val storageKey = "direct/$conversationId/${UUID.randomUUID()}.bin"
        val stored = mediaStore.store(storageKey, kind, contentType, contentLength, body)
        return try {
            tx.execute {
                val entity = directMediaRepository.save(
                    DirectMediaEntity(
                        conversationId = conversationId,
                        ownerId = ownerId,
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
                ChatMediaAttachments.directDto(entity)
            }!!
        } catch (e: RuntimeException) {
            mediaStore.delete(storageKey)
            throw e
        }
    }

    fun prepareDirectContent(conversationId: UUID, mediaId: UUID, principal: UserPrincipal): MediaContent =
        tx.execute {
            val caller = userService.getOrCreateUser(principal)
            directMessageService.requireReadableDirect(conversationId, caller)
            val media = directMediaRepository.findById(mediaId).orElse(null)
                ?.takeIf { it.conversationId == conversationId && (it.messageId != null || it.ownerId == caller.id) }
                ?: throw notFound(mediaId)
            MediaContent(media.storageKey, media.sizeBytes, media.encrypted, media.contentType)
        }!!

    fun openRange(content: MediaContent, start: Long, endInclusive: Long): InputStream =
        mediaStore.openRange(content, start, endInclusive)

    // --- Aufräumen ---

    /** Uploads, die nie gesendet wurden, in jeder Gruppe und bei Direktnachrichten. */
    @Scheduled(fixedDelayString = "PT1H", initialDelayString = "PT15M")
    fun removeAbandonedUploadsEverywhere() {
        stammtischJobs.forEachStammtisch("chat-media-cleanup") { removeAbandonedGroupUploads() }
        removeAbandonedDirectUploads()
    }

    fun removeAbandonedGroupUploads() {
        val cutoff = Instant.now().minus(ABANDONED_AFTER)
        val keys = tx.execute {
            val abandoned = chatMediaRepository.findByMessageIdIsNullAndCreatedAtBefore(cutoff)
            chatMediaRepository.deleteAll(abandoned)
            abandoned.map { it.storageKey }
        }.orEmpty()
        deleteFiles(keys)
    }

    fun removeAbandonedDirectUploads() {
        val cutoff = Instant.now().minus(ABANDONED_AFTER)
        val keys = tx.execute {
            val abandoned = directMediaRepository.findByMessageIdIsNullAndCreatedAtBefore(cutoff)
            directMediaRepository.deleteAll(abandoned)
            abandoned.map { it.storageKey }
        }.orEmpty()
        deleteFiles(keys)
    }

    private fun deleteFiles(keys: List<String>) {
        keys.forEach { key ->
            try {
                mediaStore.delete(key)
            } catch (e: RuntimeException) {
                log.warn("Verwaister Chat-Upload '{}' konnte nicht gelöscht werden: {}", key, e.message)
            }
        }
        if (keys.isNotEmpty()) log.info("{} nicht gesendete Chat-Uploads entfernt", keys.size)
    }

    private fun requirePendingBelowLimit(pending: Long) {
        if (pending >= MAX_PENDING_UPLOADS) {
            throw InvalidRequestException(Msg("error.chatMedia.pendingLimit", MAX_PENDING_UPLOADS), ErrorCode.INVALID_REQUEST)
        }
    }

    private fun notFound(mediaId: UUID) =
        ResourceNotFoundException(Msg("error.chatMedia.notFound", mediaId), ErrorCode.NOT_FOUND)

    companion object {
        /** Hochgeladen, aber noch nicht gesendet: höchstens so viele je Person und Chat. */
        const val MAX_PENDING_UPLOADS = 12L
        private val ABANDONED_AFTER: Duration = Duration.ofHours(6)
    }
}
