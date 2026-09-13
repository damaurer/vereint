package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.ChatMessageDto
import de.maurer.baseservice.dto.ConversationDto
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.ChatService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * REST-Schnittstelle für den Event-Chat (TICKET-019).
 *
 * Mitglieder greifen mit ihrer Keycloak-Identität (JWT) auf den Chat zu; Gäste
 * nutzen die `/guest`-Pfade mit dem eventgebundenen Gast-Token im Header
 * `X-Guest-Token`. Alle fachlichen Prüfungen (`deny by default`) erfolgen im
 * [ChatService]; dieser Controller übernimmt ausschließlich Bindung und
 * Statuscodes.
 */
@RestController
@RequestMapping("/api/v1/events/{eventId}/chat")
@Tag(name = "Chat", description = "Event-Chat und Chat-Mitgliedschaften")
class ChatController(
    private val chatService: ChatService,
    private val authContext: AuthContext
) {

    private fun eventId(id: String) = Identifiers.parseUuid(id, "eventId")

    @GetMapping
    @Operation(summary = "Event-Konversation abrufen", description = "Liefert die Konversation des Events für berechtigte Mitglieder")
    fun getConversation(@PathVariable("eventId") eventIdValue: String): ResponseEntity<ConversationDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(chatService.getConversation(eventId(eventIdValue), principal))
    }

    @GetMapping("/messages")
    @Operation(summary = "Nachrichten auflisten", description = "Listet die Chat-Nachrichten des Events für berechtigte Mitglieder")
    fun listMessages(@PathVariable("eventId") eventIdValue: String): ResponseEntity<List<ChatMessageDto>> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(chatService.listMessages(eventId(eventIdValue), principal))
    }

    @PostMapping("/messages")
    @Operation(summary = "Nachricht senden", description = "Sendet eine Chat-Nachricht als berechtigtes Mitglied")
    fun sendMessage(
        @PathVariable("eventId") eventIdValue: String,
        @Valid @RequestBody request: SendMessageRequest
    ): ResponseEntity<ChatMessageDto> {
        val principal = authContext.getRequiredPrincipal()
        val message = chatService.sendMessage(eventId(eventIdValue), request, principal)
        return ResponseEntity.status(HttpStatus.CREATED).body(message)
    }

    /**
     * Gast-Zugriff auf den zugewiesenen Event-Chat. Das eventgebundene Gast-Token
     * ist das Geheimnis und wird im Header `X-Guest-Token` übergeben; die
     * Autorisierung erfolgt vollständig serverseitig.
     */
    @GetMapping("/guest/messages")
    @Operation(summary = "Nachrichten als Gast auflisten", description = "Listet die Nachrichten des zugewiesenen Event-Chats für einen Gast")
    fun listGuestMessages(
        @PathVariable("eventId") eventIdValue: String,
        @RequestHeader(name = "X-Guest-Token", required = false) guestToken: String?
    ): ResponseEntity<List<ChatMessageDto>> {
        return ResponseEntity.ok(chatService.listGuestMessages(eventId(eventIdValue), guestToken))
    }

    @PostMapping("/guest/messages")
    @Operation(summary = "Nachricht als Gast senden", description = "Sendet eine Nachricht in den zugewiesenen Event-Chat eines Gastes")
    fun sendGuestMessage(
        @PathVariable("eventId") eventIdValue: String,
        @RequestHeader(name = "X-Guest-Token", required = false) guestToken: String?,
        @Valid @RequestBody request: SendMessageRequest
    ): ResponseEntity<ChatMessageDto> {
        val message = chatService.sendGuestMessage(eventId(eventIdValue), guestToken, request)
        return ResponseEntity.status(HttpStatus.CREATED).body(message)
    }
}
