package de.maurer.baseservice.dto

import jakarta.validation.constraints.Email
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.time.Instant

/** Zulässige Vorstandsrollen gemäß Datenvertrag (`BoardRole`). */
private const val BOARD_ROLE_PATTERN = "^(chair|treasurer|secretary|assessor)?$"

data class UserProfileDto(
    val id: String,
    val keycloakSubject: String,
    val displayName: String,
    val email: String?,
    val disabled: Boolean,
    val drinkRecorder: Boolean,
    val boardRole: String?,
    val roles: Set<String>,
    val permissions: Set<String>,
    val createdAt: Instant,
    val updatedAt: Instant,
    /** Fassung der AGB, der das Konto zuletzt zugestimmt hat. */
    val termsVersion: String? = null
)

data class UpdateProfileRequest(
    @field:Size(min = 1, max = 255, message = "displayName {validation.size.range}")
    val displayName: String? = null,

    @field:Email(message = "email {validation.email}")
    @field:Size(max = 255, message = "email {validation.size.max}")
    val email: String? = null
)

data class AdminUpdateUserRequest(
    @field:Size(min = 1, max = 255, message = "displayName {validation.size.range}")
    val displayName: String? = null,

    @field:Email(message = "email {validation.email}")
    @field:Size(max = 255, message = "email {validation.size.max}")
    val email: String? = null,

    val disabled: Boolean? = null,
    val drinkRecorder: Boolean? = null,

    @field:Pattern(
        regexp = BOARD_ROLE_PATTERN,
        message = "boardRole {validation.boardRole.allowed}"
    )
    val boardRole: String? = null,

    @field:RoleCodes(message = "roles {validation.roles.allowed}")
    @field:Size(max = 32, message = "roles {validation.size.maxEntries}")
    val roles: Set<String>? = null,

    @field:Size(max = 64, message = "permissions {validation.size.maxEntries}")
    val permissions: Set<String>? = null
)

data class UserSummaryDto(
    val id: String,
    val keycloakSubject: String,
    val displayName: String,
    val email: String?,
    val disabled: Boolean,
    val drinkRecorder: Boolean,
    val boardRole: String?,
    val roles: Set<String>,
    val createdAt: Instant
)

/**
 * Paginierte Antwort der administrativen Benutzerliste.
 *
 * Achtung: Dies ist ein Vertragsbruch gegenüber der bisherigen Array-Antwort;
 * der TypeScript-Typ muss entsprechend angeglichen werden.
 */
data class PagedResponse<T>(
    val content: List<T>,
    val page: Int,
    val size: Int,
    val totalElements: Long,
    val totalPages: Int,
    val sort: List<String>
)

data class AssignRolesRequest(
    @field:RoleCodes(message = "roles {validation.roles.allowed}")
    @field:Size(max = 32, message = "roles {validation.size.maxEntries}")
    val roles: Set<String> = emptySet()
)

data class AssignPermissionsRequest(
    @field:Size(max = 64, message = "permissions {validation.size.maxEntries}")
    val permissions: Set<String> = emptySet()
)

data class UpdateUserStatusRequest(
    val disabled: Boolean
)

/**
 * Eintrag des Mitgliederverzeichnisses, das alle Angemeldeten sehen (z. B. für
 * Direktnachrichten, Einladungen und die Auswahl im Vorstand). Bewusst ohne
 * E-Mail-Adresse und Keycloak-Kennung.
 */
data class MemberDirectoryEntryDto(
    val id: String,
    val displayName: String,
    val boardRole: String?,
    val roles: Set<String>
)

/** Stand der AGB-Zustimmung des angemeldeten Kontos (`GET/POST /api/v1/users/me/terms`). */
data class TermsStatusDto(
    /** Gültige Fassung der AGB. */
    val currentVersion: String,
    /** Fassung, der das Konto zuletzt zugestimmt hat; `null` ohne Zustimmung. */
    val acceptedVersion: String?,
    val acceptedAt: Instant?,
    /** Hat das Konto der gültigen Fassung zugestimmt? */
    val accepted: Boolean
)

data class AcceptTermsRequest(
    val acceptTerms: Boolean? = null
)
