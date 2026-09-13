package de.maurer.baseservice.controller

import de.maurer.baseservice.dto.AuthContextDto
import de.maurer.baseservice.security.AuthContext
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Auth", description = "Authentifizierter Benutzerkontext")
class AuthController(
    private val authContext: AuthContext
) {

    @GetMapping("/me")
    @Operation(summary = "Aktueller Benutzerkontext", description = "Liefert Subject, Anzeigename, Rollen und Permissions")
    fun getCurrentUser(): ResponseEntity<AuthContextDto> {
        val principal = authContext.getRequiredPrincipal()
        return ResponseEntity.ok(
            AuthContextDto(
                subject = principal.subject,
                displayName = principal.displayName,
                roles = principal.roles,
                boardRole = principal.boardRole,
                permissions = principal.permissions
            )
        )
    }
}
