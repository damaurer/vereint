package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.AccessCheckRequest
import de.maurer.baseservice.dto.AccessCheckResponse
import de.maurer.baseservice.dto.AccessDecisionDto
import de.maurer.baseservice.dto.RolePermissionMatrixDto
import de.maurer.baseservice.security.AppContext
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.AccessResolverService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

@RestController
@RequestMapping("/api/v1/auth/access")
@Tag(name = "Access Resolver", description = "Zugriffs-, Rollen- und Kontextauflösung")
class AccessResolverController(
    private val authContext: AuthContext,
    private val accessResolverService: AccessResolverService
) {

    private val log = LoggerFactory.getLogger(AccessResolverController::class.java)

    /**
     * Ratenbegrenzung des unauthentifizierten Gast-Endpunkts. Der Schlüssel
     * besteht aus Aufrufer-IP und Event, damit das Durchprobieren von
     * Gast-Tokens nicht möglich ist (TICKET-006).
     */
    private val guestAttempts = ConcurrentHashMap<String, MutableList<Instant>>()

    @GetMapping
    @Operation(
        summary = "Benutzerzugriff auflösen",
        description = "Ermittelt die vollständige Zugriffsentscheidung mit Rollen, Permissions, Event-Scopes, "
            + "Eigentümerschaften und erlaubten App-Kontexten"
    )
    fun resolveAccess(): ResponseEntity<AccessDecisionDto> {
        val principal = authContext.getRequiredPrincipal()
        val decision = accessResolverService.resolveUserAccess(principal)
        return ResponseEntity.ok(decision)
    }

    @GetMapping("/matrix")
    @Operation(
        summary = "Rollen-/Permission-Matrix ausliefern",
        description = "Liefert die versionierte Matrix. Kotlin ist die einzige Quelle; Express wertet sie nur aus."
    )
    fun resolveMatrix(): ResponseEntity<RolePermissionMatrixDto> {
        authContext.getRequiredPrincipal()
        return ResponseEntity.ok(accessResolverService.describeRolePermissionMatrix())
    }

    @PostMapping("/check")
    @Operation(
        summary = "Zugriffskontext oder Ressource prüfen",
        description = "Prüft ob der authentifizierte Benutzer Zugriff auf einen konkreten App-Kontext oder ein Event besitzt"
    )
    fun checkAccess(@RequestBody request: AccessCheckRequest): ResponseEntity<AccessCheckResponse> {
        val principal = authContext.getCurrentPrincipal()
        val response = accessResolverService.checkAccess(request, principal)
        return ResponseEntity.ok(response)
    }

    @PostMapping("/guest")
    @Operation(
        summary = "Gast-Zugriff validieren",
        description = "Prüft die Gültigkeit eines Gast-Tokens für ein spezifisches Event (ohne JWT-Authentifizierung). "
            + "Der Endpunkt ist pro IP und Event ratenbegrenzt."
    )
    fun validateGuestAccess(
        @RequestBody request: AccessCheckRequest,
        httpRequest: HttpServletRequest
    ): ResponseEntity<AccessCheckResponse> {
        val remoteAddress = resolveRemoteAddress(httpRequest)
        val eventId = request.eventId?.trim().orEmpty()
        val key = "$remoteAddress|$eventId"

        if (!registerAttempt(key)) {
            log.warn(
                "guest_access_rate_limited remoteAddress={} eventId={} limit={} windowSeconds={}",
                remoteAddress,
                eventId.ifBlank { "unknown" },
                GUEST_ATTEMPT_LIMIT,
                GUEST_ATTEMPT_WINDOW.seconds
            )
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(
                AccessCheckResponse(
                    allowed = false,
                    reason = "Too many guest token attempts",
                    errorCode = RATE_LIMIT_EXCEEDED,
                    appContext = AppContext.EVENT_GUEST,
                    eventId = request.eventId
                )
            )
        }

        val response = accessResolverService.validateGuestAccess(request.eventId, request.guestToken)

        if (!response.allowed) {
            // Fehlgeschlagene Versuche werden ohne Tokenwert protokolliert.
            log.warn(
                "guest_access_denied remoteAddress={} eventId={} errorCode={}",
                remoteAddress,
                eventId.ifBlank { "unknown" },
                response.errorCode ?: "access_denied"
            )
        }

        return ResponseEntity.ok(response)
    }

    /** Verwirft die Zählerstände; ausschließlich für Tests. */
    fun resetGuestRateLimit() {
        guestAttempts.clear()
    }

    private fun registerAttempt(key: String): Boolean {
        val now = Instant.now()
        val threshold = now.minus(GUEST_ATTEMPT_WINDOW)
        val attempts = guestAttempts.computeIfAbsent(key) { mutableListOf() }

        synchronized(attempts) {
            attempts.removeIf { it.isBefore(threshold) }
            if (attempts.size >= GUEST_ATTEMPT_LIMIT) {
                return false
            }
            attempts.add(now)
        }

        return true
    }

    private fun resolveRemoteAddress(request: HttpServletRequest): String {
        val forwarded = request.getHeader("X-Forwarded-For")
        if (!forwarded.isNullOrBlank()) {
            return forwarded.split(",").first().trim()
        }
        return request.remoteAddr ?: "unknown"
    }

    companion object {
        /** Maximale Versuche je IP und Event innerhalb des Zeitfensters. */
        const val GUEST_ATTEMPT_LIMIT = 10

        val GUEST_ATTEMPT_WINDOW: Duration = Duration.ofMinutes(1)

        const val RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    }
}
