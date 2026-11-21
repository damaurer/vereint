package de.maurer.baseservice.service

import de.maurer.baseservice.domain.ChatMediaEntity
import de.maurer.baseservice.domain.DirectMediaEntity
import de.maurer.baseservice.domain.MomentMediaKind
import de.maurer.baseservice.dto.ChatMediaDto
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.repository.ChatMediaRepository
import de.maurer.baseservice.repository.DirectMediaRepository
import de.maurer.baseservice.support.Identifiers
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Hängt hochgeladene Fotos und Videos an Chatnachrichten und liefert sie für
 * die Anzeige. Läuft in der Transaktion des Aufrufers (Senden, Lesen).
 */
@Component
class ChatMediaAttachments(
    private val chatMediaRepository: ChatMediaRepository,
    private val directMediaRepository: DirectMediaRepository
) {

    /** Prüft die Ids einer neuen Nachricht (eigene, noch nicht gesendete Uploads dieses Chats). */
    fun parseIds(values: List<String>?): List<UUID> {
        val ids = values.orEmpty().map { Identifiers.parseUuid(it, "mediaIds") }.distinct()
        if (ids.size > MAX_MEDIA_PER_MESSAGE) {
            throw InvalidRequestException(Msg("error.chatMedia.tooMany", MAX_MEDIA_PER_MESSAGE), ErrorCode.INVALID_REQUEST)
        }
        return ids
    }

    fun attachGroup(ids: List<UUID>, conversationId: UUID, ownerId: UUID, messageId: UUID): List<ChatMediaDto> {
        if (ids.isEmpty()) return emptyList()
        val found = chatMediaRepository.findAllById(ids).associateBy { it.id }
        val media = ids.map { id ->
            found[id]?.takeIf { it.ownerId == ownerId && it.conversationId == conversationId && it.messageId == null }
                ?: throw notUsable()
        }
        media.forEach { it.messageId = messageId }
        chatMediaRepository.saveAll(media)
        return media.map { groupDto(it) }
    }

    fun attachDirect(ids: List<UUID>, conversationId: UUID, ownerId: UUID, messageId: UUID): List<ChatMediaDto> {
        if (ids.isEmpty()) return emptyList()
        val found = directMediaRepository.findAllById(ids).associateBy { it.id }
        val media = ids.map { id ->
            found[id]?.takeIf { it.ownerId == ownerId && it.conversationId == conversationId && it.messageId == null }
                ?: throw notUsable()
        }
        media.forEach { it.messageId = messageId }
        directMediaRepository.saveAll(media)
        return media.map { directDto(it) }
    }

    fun groupMedia(messageIds: Collection<UUID>): Map<UUID, List<ChatMediaDto>> =
        if (messageIds.isEmpty()) emptyMap() else chatMediaRepository.findByMessageIdIn(messageIds)
            .sortedBy { it.createdAt }
            .groupBy({ it.messageId!! }, { groupDto(it) })

    fun directMedia(messageIds: Collection<UUID>): Map<UUID, List<ChatMediaDto>> =
        if (messageIds.isEmpty()) emptyMap() else directMediaRepository.findByMessageIdIn(messageIds)
            .sortedBy { it.createdAt }
            .groupBy({ it.messageId!! }, { directDto(it) })

    private fun notUsable() = InvalidRequestException(Msg("error.chatMedia.notUsable"), ErrorCode.INVALID_REQUEST)

    companion object {
        const val MAX_MEDIA_PER_MESSAGE = 4

        /** Art für die Vorschau in der Chatliste: Video nur, wenn alles Videos sind. */
        fun previewKind(media: List<ChatMediaDto>?): String? = when {
            media.isNullOrEmpty() -> null
            media.all { it.kind == MomentMediaKind.video.name } -> MomentMediaKind.video.name
            else -> MomentMediaKind.image.name
        }

        fun groupDto(media: ChatMediaEntity) = ChatMediaDto(
            id = media.id.toString(),
            kind = media.kind.name,
            contentType = media.contentType,
            sizeBytes = media.sizeBytes,
            width = media.width,
            height = media.height,
            durationSeconds = media.durationMs?.let { it / 1000.0 },
            url = "/api/v1/conversations/${media.conversationId}/media/${media.id}/content"
        )

        fun directDto(media: DirectMediaEntity) = ChatMediaDto(
            id = media.id.toString(),
            kind = media.kind.name,
            contentType = media.contentType,
            sizeBytes = media.sizeBytes,
            width = media.width,
            height = media.height,
            durationSeconds = media.durationMs?.let { it / 1000.0 },
            url = "/api/v1/direct-conversations/${media.conversationId}/media/${media.id}/content"
        )
    }
}
