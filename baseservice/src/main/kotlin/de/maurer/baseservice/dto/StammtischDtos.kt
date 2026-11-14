package de.maurer.baseservice.dto

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant

@Schema(description = "Der aktuell gewählte Stammtisch")
data class StammtischDto(
    val id: String,
    val name: String,
    @Schema(description = "Anzahl aktiver Mitglieder")
    val memberCount: Long,
    @Schema(description = "Eigene Rollen-Codes in diesem Stammtisch")
    val myRoles: Set<String>,
    @Schema(description = "Eigene Berechtigungen in diesem Stammtisch")
    val myPermissions: Set<String>,
    val createdAt: Instant,
    @Schema(description = "Version des Gruppenbilds; fehlt ohne Bild")
    val imageVersion: Int? = null,
    @Schema(description = "„Statistik in dieser Gruppe“")
    val statisticsEnabled: Boolean = true
)

data class UpdateStammtischRequest(
    @field:NotBlank(message = "name {validation.notBlank}")
    @field:Size(max = 80, message = "name {validation.size.max}")
    val name: String? = null
)

@Schema(description = "Rolle eines Stammtischs mit ihren Berechtigungen")
data class StammtischRoleDto(
    val id: String,
    val code: String,
    val name: String,
    val description: String?,
    val permissions: Set<String>,
    @Schema(description = "Systemrollen lassen sich anpassen, aber nicht löschen")
    val systemRole: Boolean,
    val sortOrder: Int,
    @Schema(description = "Anzahl der Personen mit dieser Rolle")
    val memberCount: Int
)

@Schema(description = "Alle Rollen des Stammtischs und alle vergebbaren Berechtigungen")
data class StammtischRolesDto(
    val roles: List<StammtischRoleDto>,
    val knownPermissions: Set<String>
)

data class SaveStammtischRoleRequest(
    @field:Size(max = 64, message = "code {validation.size.max}")
    @Schema(description = "Nur beim Anlegen; ohne Angabe aus dem Namen gebildet", example = "kassenpruefung")
    val code: String? = null,
    @field:NotBlank(message = "name {validation.notBlank}")
    @field:Size(max = 64, message = "name {validation.size.max}")
    val name: String? = null,
    @field:Size(max = 255, message = "description {validation.size.max}")
    val description: String? = null,
    val permissions: Set<String>? = null,
    val sortOrder: Int? = null
)

@Schema(description = "Stammtisch aus Sicht der Plattform-Administration")
data class PlatformStammtischDto(
    val id: String,
    val name: String,
    val archived: Boolean,
    val memberCount: Long,
    val createdAt: Instant,
    /** Belegter Speicher für Bilder und Videos. */
    val storageBytes: Long = 0,
    val imageVersion: Int? = null
)

data class CreateStammtischRequest(
    @field:NotBlank(message = "name {validation.notBlank}")
    @field:Size(max = 80, message = "name {validation.size.max}")
    val name: String? = null,
    @field:Size(max = 255, message = "adminEmail {validation.size.max}")
    @Schema(
        description = "E-Mail eines bestehenden Kontos, das Admin des Stammtischs wird. "
            + "Ohne Angabe oder ohne passendes Konto wird die anlegende Person Admin."
    )
    val adminEmail: String? = null
)

data class UpdatePlatformStammtischRequest(
    @field:Size(max = 80, message = "name {validation.size.max}")
    val name: String? = null,
    val archived: Boolean? = null
)

/** Selbstregistrierung: Konto anlegen und eigenen Stammtisch eröffnen. */
data class StammtischSignupRequest(
    @field:NotBlank(message = "stammtischName {validation.notBlank}")
    @field:Size(max = 80, message = "stammtischName {validation.size.max}")
    val stammtischName: String? = null,

    @field:NotBlank(message = "firstName {validation.notBlank}")
    @field:Size(max = 100, message = "firstName {validation.size.max}")
    val firstName: String? = null,

    @field:NotBlank(message = "lastName {validation.notBlank}")
    @field:Size(max = 100, message = "lastName {validation.size.max}")
    val lastName: String? = null,

    @field:NotBlank(message = "email {validation.notBlank}")
    @field:Email(message = "email {validation.email}")
    @field:Size(max = 254, message = "email {validation.size.max}")
    val email: String? = null,

    @field:NotBlank(message = "password {validation.notBlank}")
    @field:Size(min = 10, max = 128, message = "password {validation.size.range}")
    val password: String? = null,

    @Schema(description = "Zustimmung zu den AGB; ohne `true` antwortet der Fachservice mit `terms_not_accepted`.")
    val acceptTerms: Boolean? = null
) {
    /** Das Passwort erscheint nie in Logs. */
    override fun toString(): String = "StammtischSignupRequest(email=$email, stammtischName=$stammtischName)"
}

data class StammtischSignupResponse(
    val email: String,
    val displayName: String,
    val stammtischId: String,
    val stammtischName: String
)

/** Angemeldet einen weiteren eigenen Stammtisch eröffnen. */
data class OpenStammtischRequest(
    @field:NotBlank(message = "name {validation.notBlank}")
    @field:Size(max = 80, message = "name {validation.size.max}")
    val name: String? = null,

    @Schema(description = "Zustimmung zu den AGB; ohne `true` antwortet der Fachservice mit `terms_not_accepted`.")
    val acceptTerms: Boolean? = null
)
