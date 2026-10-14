package de.maurer.baseservice.dto

import jakarta.validation.constraints.Email
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant

data class CreateMemberInviteRequest(
    @field:Size(max = 120, message = "label {validation.size.max}")
    val label: String? = null,

    @field:Min(value = 1, message = "expiresInDays {validation.min}")
    @field:Max(value = 30, message = "expiresInDays {validation.max}")
    val expiresInDays: Int? = null,

    @field:Min(value = 1, message = "maxUses {validation.min}")
    @field:Max(value = 50, message = "maxUses {validation.max}")
    val maxUses: Int? = null
)

/** `active`, `used` (Nutzungsgrenze erreicht), `expired` oder `revoked`. */
data class MemberInviteDto(
    val id: String,
    val label: String?,
    val status: String,
    val maxUses: Int,
    val usesCount: Int,
    val expiresAt: Instant,
    val createdAt: Instant,
    val createdByName: String?,
    val revokedAt: Instant?,
    /** Anzeigenamen der Personen, die sich mit diesem Link registriert haben. */
    val registeredMembers: List<String>
)

/**
 * Antwort auf das Erzeugen eines Einladungslinks. `token` und `registerPath`
 * werden ausschließlich hier – also einmalig – ausgeliefert.
 */
data class CreateMemberInviteResponse(
    val invite: MemberInviteDto,
    val token: String,
    val registerPath: String
)

data class MemberInviteTokenRequest(
    @field:NotBlank(message = "token {validation.notBlank}")
    @field:Size(max = 256, message = "token {validation.size.max}")
    val token: String? = null
)

data class MemberInvitePreviewDto(
    val expiresAt: Instant
)

data class RegisterMemberRequest(
    @field:NotBlank(message = "token {validation.notBlank}")
    @field:Size(max = 256, message = "token {validation.size.max}")
    val token: String? = null,

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
    val password: String? = null
) {
    /** Token und Passwort erscheinen nie in Logs. */
    override fun toString(): String = "RegisterMemberRequest(email=$email)"
}

data class RegisterMemberResponse(
    val email: String,
    val displayName: String
)
