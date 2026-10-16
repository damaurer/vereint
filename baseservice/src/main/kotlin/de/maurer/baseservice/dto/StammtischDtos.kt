package de.maurer.baseservice.dto

import io.swagger.v3.oas.annotations.media.Schema
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
    val createdAt: Instant
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
    /** Tarif und Zahlungsstand (`free`/`stammtisch`/`verein`, `none`/`active`/...). */
    val plan: String = "free",
    val billingStatus: String = "none",
    val readOnly: Boolean = false,
    val storageBytes: Long = 0
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
    val archived: Boolean? = null,
    /** Tarif von Hand setzen (ohne Zahlung, Status `comped`; `free` setzt zurück). */
    val plan: String? = null
)
