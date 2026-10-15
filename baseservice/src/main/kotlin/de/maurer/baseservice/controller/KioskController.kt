package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.KioskStatusDto
import de.maurer.baseservice.dto.KioskUnlockRequest
import de.maurer.baseservice.dto.KioskUnlockResultDto
import de.maurer.baseservice.dto.SetKioskPinRequest
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.service.KioskService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Kiosk-PIN des Thekenterminals. Die PIN wird nur im Request-Body übertragen
 * und nie ausgeliefert; die Autorisierung erfolgt im [KioskService].
 */
@RestController
@RequestMapping("/api/v1/kiosk")
@Tag(name = "Kiosk", description = "PIN-Sperre des Kiosk-Modus am Thekenterminal")
class KioskController(
    private val kioskService: KioskService,
    private val authContext: AuthContext
) {

    @GetMapping("/pin")
    @Operation(summary = "Status der Kiosk-PIN", description = "Terminal, Vorstand und Administration; ob eine PIN gesetzt ist")
    fun status(): ResponseEntity<KioskStatusDto> =
        ResponseEntity.ok(kioskService.status(authContext.getRequiredPrincipal()))

    @PutMapping("/pin")
    @Operation(summary = "Kiosk-PIN setzen", description = "Nur Vorstand und Administration; 4 bis 8 Ziffern")
    fun setPin(@Valid @RequestBody request: SetKioskPinRequest): ResponseEntity<KioskStatusDto> =
        ResponseEntity.ok(kioskService.setPin(request.pin, authContext.getRequiredPrincipal()))

    @PostMapping("/unlock")
    @Operation(
        summary = "Kiosk-PIN prüfen",
        description = "Terminal, Vorstand und Administration; zählt Fehlversuche und sperrt nach fünf falschen Eingaben"
    )
    fun unlock(@Valid @RequestBody request: KioskUnlockRequest): ResponseEntity<KioskUnlockResultDto> =
        ResponseEntity.ok(kioskService.unlock(request.pin, authContext.getRequiredPrincipal()))
}
