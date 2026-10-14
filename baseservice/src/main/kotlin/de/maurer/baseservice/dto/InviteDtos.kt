package de.maurer.baseservice.dto

import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.time.Instant

/** Zulässige Einladungsrollen; temporäre Gäste erhalten ausschließlich `guest`. */
const val INVITE_ROLE_PATTERN = "^(guest)?$"

data class CreateInviteRequest(
    @field:Min(value = 1, message = "maxUses {validation.min}")
    @field:Max(value = 10000, message = "maxUses {validation.max}")
    val maxUses: Int? = null,

    @field:Min(value = 1, message = "expiresInMinutes {validation.min}")
    @field:Max(value = 129600, message = "expiresInMinutes {validation.invite.expiresInMinutes.max}")
    val expiresInMinutes: Long? = null,

    @field:Pattern(regexp = INVITE_ROLE_PATTERN, message = "role {validation.invite.role.allowed}")
    val role: String? = null
)

/**
 * Antwort auf das Erzeugen eines Magic Links. Der Rohwert `token` und der
 * zusammengesetzte `acceptPath` werden ausschließlich hier – also einmalig –
 * ausgeliefert; danach ist nur noch der Hash bekannt.
 */
data class CreateInviteResponse(
    val id: String,
    val eventId: String,
    val token: String,
    val acceptPath: String,
    val role: String,
    val maxUses: Int?,
    val usesCount: Int,
    val expiresAt: Instant?,
    val revoked: Boolean,
    val createdAt: Instant
)

data class InviteDto(
    val id: String,
    val eventId: String,
    val role: String,
    val maxUses: Int?,
    val usesCount: Int,
    val expiresAt: Instant?,
    val revoked: Boolean,
    val active: Boolean,
    val createdById: String?,
    val createdAt: Instant
)

data class AcceptInviteRequest(
    @field:NotBlank(message = "token {validation.notBlank}")
    val token: String? = null,

    @field:Size(max = 255, message = "displayName {validation.size.max}")
    val displayName: String? = null
)

/**
 * Antwort auf die Einlösung eines Magic Links. `guestToken` ist das Rohtoken
 * des eingeschränkten Eventkontexts und wird nur einmalig ausgeliefert.
 */
data class AcceptInviteResponse(
    val guestToken: String,
    val eventId: String,
    val eventTitle: String,
    val displayName: String,
    val status: String,
    val expiresAt: Instant
)
