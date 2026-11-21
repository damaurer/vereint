package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.ChatMediaDto
import de.maurer.baseservice.dto.ChatMessageDto
import de.maurer.baseservice.dto.ChatUnreadCountDto
import de.maurer.baseservice.dto.ConversationSummaryDto
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.dto.StartDirectConversationRequest
import de.maurer.baseservice.dto.ToggleReactionRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.DirectMessageService
import de.maurer.baseservice.service.ChatMediaService
import de.maurer.baseservice.support.Identifiers
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.web.bind.annotation.RequestHeader
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Gruppenübergreifende Direktnachrichten: ein Gespräch je Personenpaar.
 * Läuft ohne gewählte Gruppe; die Rechte prüft der [DirectMessageService].
 */
@RestController
@RequestMapping("/api/v1/direct-conversations")
@Tag(name = "Direktnachrichten", description = "Gruppenübergreifende Einzelgespräche")
class DirectConversationController(
    private val directMessageService: DirectMessageService,
    private val authContext: AuthContext,
    private val chatMediaService: ChatMediaService
) {

    private fun conversationId(id: String) = Identifiers.parseUuid(id, "conversationId")
    private fun messageId(id: String) = Identifiers.parseUuid(id, "messageId")

    @GetMapping
    @Operation(summary = "Eigene Direktnachrichten", description = "Alle eigenen Einzelgespräche, neueste Nachricht zuerst")
    fun list(): ResponseEntity<List<ConversationSummaryDto>> =
        ResponseEntity.ok(directMessageService.list(authContext.getRequiredPrincipal()))

    @GetMapping("/unread-count")
    @Operation(summary = "Ungelesene Direktnachrichten", description = "Summe ungelesener Direktnachrichten")
    fun unreadCount(): ResponseEntity<ChatUnreadCountDto> =
        ResponseEntity.ok(directMessageService.unreadCount(authContext.getRequiredPrincipal()))

    @PostMapping
    @Operation(summary = "Direktnachricht beginnen", description = "Liefert das Gespräch mit einer Person und legt es bei Bedarf an (Freunde oder gemeinsame Gruppe)")
    fun start(@Valid @RequestBody request: StartDirectConversationRequest): ResponseEntity<ConversationSummaryDto> =
        ResponseEntity.ok(directMessageService.start(request.userId, authContext.getRequiredPrincipal()))

    @GetMapping("/{conversationId}/messages")
    @Operation(summary = "Nachrichten lesen", description = "Nachrichten eines Gesprächs mit Reaktionen")
    fun messages(@PathVariable conversationId: String): ResponseEntity<List<ChatMessageDto>> =
        ResponseEntity.ok(directMessageService.messages(conversationId(conversationId), authContext.getRequiredPrincipal()))

    @PostMapping("/{conversationId}/messages")
    @Operation(summary = "Nachricht senden", description = "Sendet eine Direktnachricht")
    fun send(
        @PathVariable conversationId: String,
        @Valid @RequestBody request: SendMessageRequest
    ): ResponseEntity<ChatMessageDto> {
        val message = directMessageService.send(conversationId(conversationId), request, authContext.getRequiredPrincipal())
        return ResponseEntity.status(HttpStatus.CREATED).body(message)
    }

    @PostMapping("/{conversationId}/read")
    @Operation(summary = "Als gelesen markieren", description = "Setzt den eigenen Lesestand auf jetzt")
    fun read(@PathVariable conversationId: String): ResponseEntity<ConversationSummaryDto> =
        ResponseEntity.ok(directMessageService.markRead(conversationId(conversationId), authContext.getRequiredPrincipal()))

    @PostMapping("/{conversationId}/typing")
    @Operation(summary = "Schreibt gerade", description = "Zeigt dem Gegenüber für einige Sekunden „schreibt gerade…“; höchstens alle 2 Sekunden je Person")
    fun typing(@PathVariable conversationId: String): ResponseEntity<Void> {
        directMessageService.typing(conversationId(conversationId), authContext.getRequiredPrincipal())
        return ResponseEntity.noContent().build()
    }

    @PostMapping("/{conversationId}/messages/{messageId}/reactions")
    @Operation(summary = "Reaktion umschalten", description = "Setzt oder entfernt die eigene Reaktion auf eine Nachricht")
    fun react(
        @PathVariable conversationId: String,
        @PathVariable messageId: String,
        @Valid @RequestBody request: ToggleReactionRequest
    ): ResponseEntity<ChatMessageDto> =
        ResponseEntity.ok(
            directMessageService.toggleReaction(
                conversationId(conversationId),
                messageId(messageId),
                request.emoji,
                authContext.getRequiredPrincipal()
            )
        )

    /**
     * Nimmt ein Foto (JPEG/PNG/GIF) oder ein kurzes Video (MP4/MOV, bis 60 s)
     * als rohen Körper entgegen: `Content-Type` ist der Dateityp,
     * `Content-Length` Pflicht. Die Datei wird mit der nächsten Nachricht
     * (`mediaIds`) sichtbar.
     */
    @PostMapping("/{conversationId}/media")
    @Operation(summary = "Foto oder Video hochladen", description = "Lädt ein Foto oder kurzes Video für die nächste eigene Nachricht hoch")
    fun uploadMedia(@PathVariable conversationId: String, request: HttpServletRequest): ResponseEntity<ChatMediaDto> {
        val media = chatMediaService.uploadDirect(
            conversationId(conversationId),
            request.contentType,
            request.contentLengthLong,
            request.inputStream,
            authContext.getRequiredPrincipal()
        )
        return ResponseEntity.status(HttpStatus.CREATED).body(media)
    }

    @GetMapping("/{conversationId}/media/{mediaId}/content")
    @Operation(summary = "Foto oder Video abrufen", description = "Liefert eine Chat-Datei für Berechtigte; Videos mit HTTP-Range")
    fun mediaContent(
        @PathVariable conversationId: String,
        @PathVariable mediaId: String,
        @RequestHeader(HttpHeaders.RANGE, required = false) rangeHeader: String?,
        response: HttpServletResponse
    ) {
        val content = chatMediaService.prepareDirectContent(
            conversationId(conversationId),
            Identifiers.parseUuid(mediaId, "mediaId"),
            authContext.getRequiredPrincipal()
        )
        MediaResponses.send(content, rangeHeader, response, chatMediaService::openRange)
    }
}
