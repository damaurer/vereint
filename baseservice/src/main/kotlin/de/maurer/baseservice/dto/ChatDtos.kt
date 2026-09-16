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
    @field:NotBlank(message = "message darf nicht leer sein")
    @field:Size(max = 4000, message = "message darf höchstens 4000 Zeichen lang sein")
    val message: String? = null,

    @field:Size(max = 512, message = "imageUrl darf höchstens 512 Zeichen lang sein")
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
    val createdAt: Instant
)
