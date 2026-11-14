package de.maurer.baseservice.controller

import de.maurer.baseservice.live.LiveUpdateHub
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.UserService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter

/**
 * Live-Verbindung der App (Server-Sent Events). Läuft ohne gewählte Gruppe, weil
 * Direktnachrichten und Mitteilungen gruppenübergreifend sind. Die Signale tragen
 * keine Inhalte (siehe [de.maurer.baseservice.live.LiveEvent]).
 */
@RestController
@RequestMapping("/api/v1/live")
@Tag(name = "Live", description = "Sofortige Aktualisierung von Chats und Mitteilungen")
class LiveController(
    private val liveUpdateHub: LiveUpdateHub,
    private val userService: UserService,
    private val authContext: AuthContext
) {

    @GetMapping(produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    @Operation(
        summary = "Live-Signale",
        description = "Ereignisstrom `chat`, `direct`, `read` und `notification` für die eigenen Geräte; endet nach 10 Minuten und wird vom Browser neu aufgebaut"
    )
    fun stream(response: HttpServletResponse): SseEmitter {
        val caller = userService.getOrCreateUser(authContext.getRequiredPrincipal())
        // Kein Zwischenspeichern und keine Kompression unterwegs (Proxy, BFF).
        response.setHeader("Cache-Control", "no-cache, no-transform")
        response.setHeader("X-Accel-Buffering", "no")
        return liveUpdateHub.connect(caller.id)
    }
}
