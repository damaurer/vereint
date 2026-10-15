package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.KioskSessionDto
import de.maurer.baseservice.dto.KioskUnlockRequest
import de.maurer.baseservice.dto.KioskUnlockResultDto
import de.maurer.baseservice.dto.StartKioskSessionRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.KioskService
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
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Kiosk-Sitzungen des Thekenterminals. Die PIN wird nur im Request-Body
 * übertragen und nie ausgeliefert; die Autorisierung erfolgt im [KioskService].
 */
@RestController
@RequestMapping("/api/v1/kiosk/sessions")
@Tag(name = "Kiosk", description = "Gesperrter Kiosk-Modus am Thekenterminal")
class KioskController(
    private val kioskService: KioskService,
    private val authContext: AuthContext
) {

    private fun sessionId(id: String) = Identifiers.parseUuid(id, "sessionId")

    @PostMapping
    @Operation(summary = "Kiosk-Modus starten", description = "Terminal, Vorstand und Administration; das Gerät vergibt eine PIN mit 4 bis 8 Ziffern")
    fun start(@Valid @RequestBody request: StartKioskSessionRequest): ResponseEntity<KioskSessionDto> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(kioskService.start(request.pin, request.label, authContext.getRequiredPrincipal()))

    @GetMapping
    @Operation(summary = "Laufende Kiosk-Sitzungen", description = "Nur Vorstand und Administration")
    fun listActive(): ResponseEntity<List<KioskSessionDto>> =
        ResponseEntity.ok(kioskService.listActive(authContext.getRequiredPrincipal()))

    @GetMapping("/{sessionId}")
    @Operation(summary = "Zustand einer Kiosk-Sitzung", description = "Terminal, Vorstand und Administration; zeigt, ob die Sitzung aus der Ferne beendet wurde")
    fun state(@PathVariable("sessionId") id: String): ResponseEntity<KioskSessionDto> =
        ResponseEntity.ok(kioskService.state(sessionId(id), authContext.getRequiredPrincipal()))

    @PostMapping("/{sessionId}/unlock")
    @Operation(summary = "Kiosk-Modus mit PIN verlassen", description = "Zählt Fehlversuche und sperrt nach fünf falschen Eingaben")
    fun unlock(
        @PathVariable("sessionId") id: String,
        @Valid @RequestBody request: KioskUnlockRequest
    ): ResponseEntity<KioskUnlockResultDto> =
        ResponseEntity.ok(kioskService.unlock(sessionId(id), request.pin, authContext.getRequiredPrincipal()))

    @PostMapping("/{sessionId}/end")
    @Operation(summary = "Kiosk-Sitzung aus der Ferne beenden", description = "Nur Vorstand und Administration; ohne PIN")
    fun endRemotely(@PathVariable("sessionId") id: String): ResponseEntity<KioskSessionDto> =
        ResponseEntity.ok(kioskService.endRemotely(sessionId(id), authContext.getRequiredPrincipal()))
}
