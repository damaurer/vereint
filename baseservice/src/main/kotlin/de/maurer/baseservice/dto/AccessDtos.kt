package de.maurer.baseservice.dto

import de.maurer.baseservice.security.RolePermissionMatrix
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "Ergebnis der Zugriffs- und Rollenauflösung für einen Benutzer")
data class AccessDecisionDto(
    @Schema(description = "Keycloak Subject (technische Identität)", example = "f81d4fae-7dec-11d0-a765-00a0c91e6bf6")
    val subject: String,

    @Schema(description = "Interne VEREINT-Benutzer-ID", example = "usr-12345")
    val userId: String? = null,

    @Schema(description = "Anzeigename des Benutzers", example = "Max Mustermann")
    val displayName: String? = null,

    @Schema(description = "E-Mail-Adresse", example = "max@example.com")
    val email: String? = null,

    @Schema(description = "Gibt an, ob das Benutzerkonto deaktiviert ist", example = "false")
    val disabled: Boolean = false,

    @Schema(description = "Zugewiesene Benutzerrollen", example = "[\"member\", \"board\"]")
    val roles: Set<String> = emptySet(),

    @Schema(description = "Spezifische Vorstandsrolle", example = "treasurer")
    val boardRole: String? = null,

    @Schema(description = "Berechtigung zur manuellen Strichlisten-Erfassung", example = "false")
    val drinkRecorder: Boolean = false,

    @Schema(description = "Effektive granulare Berechtigungen", example = "[\"profile.read.self\", \"ledger.read\"]")
    val permissions: Set<String> = emptySet(),

    @Schema(description = "IDs aller Events mit aktiver Teilnahme oder Eigentümerschaft", example = "[\"evt-1\", \"evt-2\"]")
    val eventScopes: Set<String> = emptySet(),

    @Schema(
        description = "IDs ausschließlich der Events in eigener Eigentümerschaft; "
            + "Grundlage des Kontexts eventOwner",
        example = "[\"evt-1\"]"
    )
    val ownedEvents: Set<String> = emptySet(),

    @Schema(description = "Erlaubte Anwendungskontexte für Routing und SSR", example = "[\"memberPwa\", \"boardGeneral\"]")
    val allowedAppContexts: Set<String> = emptySet(),

    @Schema(
        description = "Version der Rollen-/Permission-Matrix, aus der die Entscheidung abgeleitet wurde",
        example = "1"
    )
    val matrixVersion: Int = RolePermissionMatrix.VERSION
)

@Schema(
    description = "Versionierte Rollen-/Permission-Matrix. Kotlin ist die einzige Quelle; "
        + "Express wertet diese Antwort ausschließlich aus."
)
data class RolePermissionMatrixDto(
    @Schema(description = "Version der Matrix; steigt bei jeder inhaltlichen Änderung", example = "1")
    val version: Int,

    @Schema(description = "Zuordnung Rolle zu Permissions")
    val roles: Map<String, Set<String>>,

    @Schema(description = "Alle zuweisbaren Rollennamen", example = "[\"member\", \"board\", \"admin\"]")
    val assignableRoles: Set<String>,

    @Schema(description = "Alle bekannten Permission-Namen")
    val knownPermissions: Set<String>,

    @Schema(description = "Alle bekannten App-Kontexte", example = "[\"memberPwa\", \"admin\"]")
    val appContexts: Set<String>
)

@Schema(description = "Anfrage zur Überprüfung eines spezifischen Zugriffskontexts oder einer Ressource")
data class AccessCheckRequest(
    @Schema(description = "Zielkontext der Anwendung (z. B. memberPwa, boardGeneral, eventGuest)", example = "memberPwa", required = true)
    val appContext: String,

    @Schema(description = "Optionale Event-ID für eventgebundene Kontexte", example = "evt-12345")
    val eventId: String? = null,

    @Schema(description = "Optionaler Gast-Token für Einladungen", example = "secret-guest-token")
    val guestToken: String? = null,

    @Schema(description = "Optionale spezifische Permission zur Prüfung", example = "ledger.read")
    val permission: String? = null
)

@Schema(description = "Ergebnis einer Zugriffsprüfung")
data class AccessCheckResponse(
    @Schema(description = "Gibt an, ob der Zugriff erlaubt ist", example = "true")
    val allowed: Boolean,

    @Schema(description = "Begründung oder Detailtext bei Verweigerung", example = "Access granted")
    val reason: String? = null,

    @Schema(description = "Fehlercode bei Zugriffsverweigerung", example = "access_denied")
    val errorCode: String? = null,

    @Schema(description = "Geprüfter Anwendungskontext", example = "memberPwa")
    val appContext: String? = null,

    @Schema(description = "Geprüfte Event-ID", example = "evt-12345")
    val eventId: String? = null
)
