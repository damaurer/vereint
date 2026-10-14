package de.maurer.baseservice.dto

import jakarta.validation.constraints.Email
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant

data class CreateMemberInviteRequest(
    @field:Size(max = 120, message = "label darf höchstens 120 Zeichen lang sein")
    val label: String? = null,

    @field:Min(value = 1, message = "expiresInDays muss mindestens 1 sein")
    @field:Max(value = 30, message = "expiresInDays darf höchstens 30 sein")
    val expiresInDays: Int? = null,

    @field:Min(value = 1, message = "maxUses muss mindestens 1 sein")
    @field:Max(value = 50, message = "maxUses darf höchstens 50 sein")
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
    @field:NotBlank(message = "token darf nicht leer sein")
    @field:Size(max = 256, message = "token ist zu lang")
    val token: String? = null
)

data class MemberInvitePreviewDto(
    val expiresAt: Instant
)

data class RegisterMemberRequest(
    @field:NotBlank(message = "token darf nicht leer sein")
    @field:Size(max = 256, message = "token ist zu lang")
    val token: String? = null,

    @field:NotBlank(message = "Vorname darf nicht leer sein")
    @field:Size(max = 100, message = "Vorname darf höchstens 100 Zeichen lang sein")
    val firstName: String? = null,

    @field:NotBlank(message = "Nachname darf nicht leer sein")
    @field:Size(max = 100, message = "Nachname darf höchstens 100 Zeichen lang sein")
    val lastName: String? = null,

    @field:NotBlank(message = "E-Mail darf nicht leer sein")
    @field:Email(message = "E-Mail ist ungültig")
    @field:Size(max = 254, message = "E-Mail darf höchstens 254 Zeichen lang sein")
    val email: String? = null,

    @field:NotBlank(message = "Passwort darf nicht leer sein")
    @field:Size(min = 10, max = 128, message = "Passwort muss 10 bis 128 Zeichen lang sein")
    val password: String? = null
) {
    /** Token und Passwort erscheinen nie in Logs. */
    override fun toString(): String = "RegisterMemberRequest(email=$email)"
}

data class RegisterMemberResponse(
    val email: String,
    val displayName: String
)
