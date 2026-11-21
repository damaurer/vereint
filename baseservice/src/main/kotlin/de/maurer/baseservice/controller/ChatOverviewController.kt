package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.ChatUnreadCountDto
import de.maurer.baseservice.dto.ConversationSummaryDto
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.ChatOverviewService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Gemeinsame Chat-Liste über alle eigenen Gruppen. Läuft ohne gewählte Gruppe;
 * der [ChatOverviewService] liest jede Gruppe in ihrem eigenen Kontext.
 * Lesen und Schreiben einzelner Chats bleibt bei `/api/v1/conversations`
 * (Gruppe im Header) und `/api/v1/direct-conversations`.
 */
@RestController
@RequestMapping("/api/v1/chats")
@Tag(name = "Chats", description = "Alle eigenen Chats in einer Liste")
class ChatOverviewController(
    private val chatOverviewService: ChatOverviewService,
    private val authContext: AuthContext
) {

    @GetMapping
    @Operation(
        summary = "Alle Chats",
        description = "Gruppenchats und Event-Chats aller eigenen Gruppen sowie Direktnachrichten, neueste Nachricht zuerst"
    )
    fun list(): ResponseEntity<List<ConversationSummaryDto>> =
        ResponseEntity.ok(chatOverviewService.overview(authContext.getRequiredPrincipal()))

    @GetMapping("/unread-count")
    @Operation(summary = "Ungelesene Nachrichten", description = "Summe ungelesener Nachrichten über alle eigenen Chats")
    fun unreadCount(): ResponseEntity<ChatUnreadCountDto> =
        ResponseEntity.ok(chatOverviewService.unreadCount(authContext.getRequiredPrincipal()))
}
