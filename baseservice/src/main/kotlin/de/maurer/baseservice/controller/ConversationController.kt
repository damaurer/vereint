package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.ChatMessageDto
import de.maurer.baseservice.dto.ChatUnreadCountDto
import de.maurer.baseservice.dto.ConversationSummaryDto
import de.maurer.baseservice.dto.PinNoteRequest
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.dto.ToggleReactionRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.ConversationService
import de.maurer.baseservice.support.Identifiers
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Chat-Übersicht für Mitglieder: Gruppenchat und die Event-Chats, zu denen man
 * eingeladen ist. Direktnachrichten sind gruppenübergreifend und liegen im
 * [DirectConversationController]. Rechte prüft der
 * [ConversationService] (`deny by default`).
 */
@RestController
@RequestMapping("/api/v1/conversations")
@Tag(name = "Konversationen", description = "Vereinschat, Direktnachrichten und Chat-Übersicht")
class ConversationController(
    private val conversationService: ConversationService,
    private val authContext: AuthContext
) {

    private fun conversationId(id: String) = Identifiers.parseUuid(id, "conversationId")
    private fun messageId(id: String) = Identifiers.parseUuid(id, "messageId")

    @GetMapping
    @Operation(summary = "Chat-Übersicht", description = "Vereinschat, eigene Direktnachrichten und Event-Chats mit ungelesenen Nachrichten")
    fun list(): ResponseEntity<List<ConversationSummaryDto>> =
        ResponseEntity.ok(conversationService.listConversations(authContext.getRequiredPrincipal()))

    @GetMapping("/unread-count")
    @Operation(summary = "Ungelesene Chatnachrichten", description = "Summe ungelesener Nachrichten über alle eigenen Chats")
    fun unreadCount(): ResponseEntity<ChatUnreadCountDto> =
        ResponseEntity.ok(conversationService.unreadCount(authContext.getRequiredPrincipal()))

    @GetMapping("/club")
    @Operation(summary = "Vereinschat", description = "Übersichtseintrag des Vereinschats inklusive Infotafel")
    fun club(): ResponseEntity<ConversationSummaryDto> =
        ResponseEntity.ok(conversationService.clubSummary(authContext.getRequiredPrincipal()))

    @PutMapping("/club/pin")
    @Operation(summary = "Infotafel setzen", description = "Setzt oder entfernt die Infotafel des Vereinschats (Vorstand/Administration)")
    fun pin(@Valid @RequestBody request: PinNoteRequest): ResponseEntity<ConversationSummaryDto> =
        ResponseEntity.ok(conversationService.pinClubNote(request, authContext.getRequiredPrincipal()))

    @GetMapping("/{conversationId}/messages")
    @Operation(summary = "Nachrichten lesen", description = "Nachrichten einer Konversation mit Reaktionen")
    fun messages(@PathVariable conversationId: String): ResponseEntity<List<ChatMessageDto>> =
        ResponseEntity.ok(conversationService.listMessages(conversationId(conversationId), authContext.getRequiredPrincipal()))

    @PostMapping("/{conversationId}/messages")
    @Operation(summary = "Nachricht senden", description = "Sendet eine Nachricht in eine Konversation")
    fun send(
        @PathVariable conversationId: String,
        @Valid @RequestBody request: SendMessageRequest
    ): ResponseEntity<ChatMessageDto> {
        val message = conversationService.sendMessage(conversationId(conversationId), request, authContext.getRequiredPrincipal())
        return ResponseEntity.status(HttpStatus.CREATED).body(message)
    }

    @PostMapping("/{conversationId}/read")
    @Operation(summary = "Als gelesen markieren", description = "Setzt den eigenen Lesestand auf jetzt")
    fun read(@PathVariable conversationId: String): ResponseEntity<ConversationSummaryDto> =
        ResponseEntity.ok(conversationService.markRead(conversationId(conversationId), authContext.getRequiredPrincipal()))

    @PostMapping("/{conversationId}/messages/{messageId}/reactions")
    @Operation(summary = "Reaktion umschalten", description = "Setzt oder entfernt die eigene Reaktion auf eine Nachricht")
    fun react(
        @PathVariable conversationId: String,
        @PathVariable messageId: String,
        @Valid @RequestBody request: ToggleReactionRequest
    ): ResponseEntity<ChatMessageDto> =
        ResponseEntity.ok(
            conversationService.toggleReaction(
                conversationId(conversationId),
                messageId(messageId),
                request.emoji,
                authContext.getRequiredPrincipal()
            )
        )
}
