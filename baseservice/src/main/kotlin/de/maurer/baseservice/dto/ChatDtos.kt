package de.maurer.baseservice.dto

import com.fasterxml.jackson.annotation.JsonIgnore
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
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
    /** Text der Nachricht; darf leer sein, wenn Fotos oder Videos dabei sind. */
    @field:Size(max = 4000, message = "message {validation.size.max}")
    val message: String? = null,

    /** Vorher hochgeladene Fotos/Videos (`…/media`), höchstens vier je Nachricht. */
    @field:Size(max = 4, message = "mediaIds {validation.size.max}")
    val mediaIds: List<String>? = null,

    @field:Size(max = 512, message = "imageUrl {validation.size.max}")
    val imageUrl: String? = null,

    /**
     * Von der App vergebene Id der Nachricht. Sendet die App nach einem
     * Verbindungsabbruch erneut, liefert der Server die schon gespeicherte
     * Nachricht zurück, statt eine zweite anzulegen.
     */
    @field:Size(max = 64, message = "clientId {validation.size.max}")
    @field:Pattern(regexp = "^[A-Za-z0-9_-]+$", message = "clientId {validation.clientId}")
    val clientId: String? = null
) {
    /** Eine Nachricht braucht Text oder mindestens ein Foto/Video. */
    @get:JsonIgnore
    @get:AssertTrue(message = "message {validation.notBlank}")
    val hasContent: Boolean
        get() = !message.isNullOrBlank() || !mediaIds.isNullOrEmpty()
}

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
    val reactions: List<ChatReactionDto> = emptyList(),
    /** App-Id beim Senden (nur bei eigenen Nachrichten gesetzt). */
    val clientId: String? = null,
    /** Haken; nur bei eigenen Nachrichten. */
    val receipt: MessageReceiptDto? = null,
    /** Fotos und Videos der Nachricht (nur über den Content-Endpunkt abrufbar). */
    val media: List<ChatMediaDto> = emptyList(),
    /** Hinweiszeile statt Nachricht: `rsvp_accepted` oder `rsvp_declined`. */
    val kind: String? = null,
    /** Bei Zu-/Absagen im Chat einer Serie: Beginn des Termins. */
    val rsvpEventStartsAt: Instant? = null,
    /**
     * Antwort der Absenderin (`accepted`/`declined`) auf den Termin, für den die
     * Nachricht geschrieben wurde; nur solange der Termin nicht vorbei ist.
     */
    val senderRsvp: String? = null
)

/**
 * Foto oder Video einer Chatnachricht. [url] zeigt auf den
 * berechtigungsgeprüften Content-Endpunkt; Videos unterstützen dort HTTP-Range.
 */
data class ChatMediaDto(
    val id: String,
    val kind: String,
    val contentType: String,
    val sizeBytes: Long,
    val width: Int?,
    val height: Int?,
    val durationSeconds: Double?,
    val url: String
)

/**
 * Stand einer eigenen Nachricht wie bei bekannten Messengern:
 * - `sent`: beim Server angekommen (ein Haken)
 * - `delivered`: auf den Geräten aller Empfänger angekommen (zwei Haken)
 * - `read`: von allen Empfängern gelesen (zwei farbige Haken)
 *
 * In Gruppen zählen `delivered` und `read` mit, wie viele der `recipients`
 * so weit sind; die Haken wechseln erst, wenn es alle sind.
 */
data class MessageReceiptDto(
    val status: String,
    val recipients: Int,
    val delivered: Int,
    val read: Int
) {
    companion object {
        const val SENT = "sent"
        const val DELIVERED = "delivered"
        const val READ = "read"
    }
}

/**
 * Nachrichten-Info wie bei bekannten Messengern: Stand der eigenen Nachricht
 * bei jeder Person, die den Chat lesen darf. `status` ist `read` (gelesen),
 * `delivered` (zugestellt, noch nicht gelesen) oder `sent` (noch nicht
 * zugestellt). Zeitpunkte gibt es nicht je Nachricht, nur je Chat.
 */
data class MessageInfoDto(
    val messageId: String,
    val recipients: List<MessageInfoRecipientDto>
)

data class MessageInfoRecipientDto(
    val userId: String,
    val displayName: String,
    val status: String
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
    val createdAt: Instant,
    /** `image` oder `video`, wenn die Nachricht Fotos/Videos enthält. */
    val mediaKind: String? = null,
    /** Zu-/Absage-Hinweis statt Nachricht (`rsvp_accepted`/`rsvp_declined`). */
    val kind: String? = null
)

/**
 * Eintrag der Chat-Übersicht: Vereinschat (`club`), Direktnachricht (`direct`)
 * oder Event-Chat (`event`). `partnerId`/`partnerName` gibt es nur bei
 * Direktnachrichten; die Infotafel nur im Vereinschat. `stammtischId` und
 * `stammtischName` nennt die gemeinsame Chat-Liste (`/api/v1/chats`) bei
 * Gruppen- und Event-Chats; Direktnachrichten gehören keiner Gruppe.
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
    val canWrite: Boolean,
    val stammtischId: String? = null,
    val stammtischName: String? = null,
    /** Nur bei Moment-Chats: der Moment und wann der Chat schließt (24 Stunden nach Start). */
    val momentId: String? = null,
    val expiresAt: Instant? = null
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
