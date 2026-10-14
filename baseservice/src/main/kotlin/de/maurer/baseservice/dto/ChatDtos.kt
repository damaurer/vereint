package de.maurer.baseservice.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant

/**
 * Anfrage zum Senden einer Chat-Nachricht (TICKET-019).
 *
 * Der Text ist Pflicht; ein optionaler Bildverweis (`imageUrl`) referenziert ein
 * bereits im Objektspeicher abgelegtes, privates Bild. Rohbilder werden nicht
 * über den Chat übertragen.
 */
data class SendMessageRequest(
    @field:NotBlank(message = "message {validation.notBlank}")
    @field:Size(max = 4000, message = "message {validation.size.max}")
    val message: String? = null,

    @field:Size(max = 512, message = "imageUrl {validation.size.max}")
    val imageUrl: String? = null
)

/**
 * Öffentliche Sicht auf eine Konversation. Enthält keine Mitgliederliste, sondern
 * nur die Anzahl, damit private Teilnehmerdaten nicht unnötig preisgegeben werden.
 */
data class ConversationDto(
    val id: String,
    val type: String,
    val eventId: String?,
    val title: String?,
    val memberCount: Int,
    val expiresAt: Instant? = null
)

/**
 * Öffentliche Sicht auf eine Chat-Nachricht. `senderType` unterscheidet Mitglied
 * (`member`) und Gast (`guest`); `senderName` ist der Anzeigename zum Zeitpunkt
 * der Antwort.
 */
data class ChatMessageDto(
    val id: String,
    val conversationId: String,
    val senderType: String,
    val senderId: String?,
    val senderName: String,
    val message: String,
    val imageUrl: String?,
    val createdAt: Instant,
    val reactions: List<ChatReactionDto> = emptyList()
)

/** Zusammengefasste Reaktionen auf eine Nachricht. */
data class ChatReactionDto(
    val emoji: String,
    val count: Int,
    val reactedByMe: Boolean
)

/** Vorschau der letzten Nachricht einer Konversation. */
data class ChatMessagePreviewDto(
    val senderName: String,
    val message: String,
    val createdAt: Instant
)

/**
 * Eintrag der Chat-Übersicht: Vereinschat (`club`), Direktnachricht (`direct`)
 * oder Event-Chat (`event`). `partnerId`/`partnerName` gibt es nur bei
 * Direktnachrichten; die Infotafel nur im Vereinschat.
 */
data class ConversationSummaryDto(
    val id: String,
    val type: String,
    val title: String,
    val eventId: String?,
    val partnerId: String?,
    val partnerName: String?,
    val lastMessage: ChatMessagePreviewDto?,
    val unreadCount: Long,
    val pinned: PinnedNoteDto?,
    val canWrite: Boolean
)

data class PinnedNoteDto(
    val text: String,
    val authorName: String,
    val pinnedAt: Instant
)

data class ChatUnreadCountDto(
    val unread: Long
)

data class StartDirectConversationRequest(
    @field:NotBlank(message = "userId {validation.notBlank}")
    val userId: String? = null
)

data class ToggleReactionRequest(
    @field:NotBlank(message = "emoji {validation.notBlank}")
    @field:Size(max = 16, message = "emoji {validation.size.max}")
    val emoji: String? = null
)

/** Infotafel setzen (`text`) oder entfernen (leer bzw. `null`). */
data class PinNoteRequest(
    @field:Size(max = 2000, message = "text {validation.size.max}")
    val text: String? = null
)
