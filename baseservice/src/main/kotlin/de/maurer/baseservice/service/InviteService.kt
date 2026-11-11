package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventGuestEntity
import de.maurer.baseservice.domain.EventInviteEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.GuestStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.AcceptInviteRequest
import de.maurer.baseservice.dto.AcceptInviteResponse
import de.maurer.baseservice.dto.CreateInviteRequest
import de.maurer.baseservice.dto.CreateInviteResponse
import de.maurer.baseservice.dto.InviteDto
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.EventNotActiveException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.InvitationExpiredException
import de.maurer.baseservice.error.InvitationRevokedException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.EventGuestRepository
import de.maurer.baseservice.repository.EventInviteRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.support.SecureTokens
import de.maurer.baseservice.tenancy.StammtischAccess
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Fachlicher Slice für Einladungen und temporäre Gäste (TICKET-011).
 *
 * Magic Links werden ausschließlich im Spring-Service erzeugt. In PostgreSQL
 * liegt nur der SHA-256-Hash; der Rohwert verlässt den Server einmalig bei der
 * Erzeugung. Ein Link ist zeitlich begrenzt, widerrufbar, an genau ein Event
 * gebunden und kann eine Nutzungsgrenze besitzen. Die Verwaltung folgt der
 * objektbezogenen Owner-/Board-Prüfung (`deny by default`); das Einlösen ist
 * bewusst ohne Authentifizierung möglich, weil das Token selbst das Geheimnis
 * ist (siehe `docs/baseservice/03-security-and-authorization.md`, Abschnitt „Gast-Token").
 */
@Service
@Transactional
class InviteService(
    private val eventRepository: EventRepository,
    private val eventInviteRepository: EventInviteRepository,
    private val eventGuestRepository: EventGuestRepository,
    private val access: StammtischAccess,
    private val userService: UserService
) {

    fun createInvite(eventId: UUID, request: CreateInviteRequest, principal: UserPrincipal): CreateInviteResponse {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        if (event.status == EventStatus.cancelled || event.status == EventStatus.archived) {
            throw EventNotActiveException(
                Msg("error.invite.eventClosed"),
                ErrorCode.EVENT_NOT_ACTIVE
            )
        }

        val rawToken = SecureTokens.generateToken()
        val minutes = request.expiresInMinutes ?: DEFAULT_INVITE_TTL_MINUTES
        val expiresAt = Instant.now().plus(Duration.ofMinutes(minutes))

        val invite = EventInviteEntity(
            event = event,
            tokenHash = SecureTokens.sha256Hex(rawToken),
            createdBy = caller,
            role = normalizeRole(request.role),
            maxUses = request.maxUses,
            usesCount = 0,
            expiresAt = expiresAt,
            revoked = false
        )
        val saved = eventInviteRepository.save(invite)

        return CreateInviteResponse(
            id = saved.id.toString(),
            eventId = event.id.toString(),
            token = rawToken,
            acceptPath = "$ACCEPT_PATH_PREFIX$rawToken",
            role = saved.role,
            maxUses = saved.maxUses,
            usesCount = saved.usesCount,
            expiresAt = saved.expiresAt,
            revoked = saved.revoked,
            createdAt = saved.createdAt
        )
    }

    @Transactional(readOnly = true)
    fun listInvites(eventId: UUID, principal: UserPrincipal): List<InviteDto> {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        return eventInviteRepository.findByEventId(eventId)
            .sortedByDescending { it.createdAt }
            .map { toInviteDto(it) }
    }

    fun revokeInvite(eventId: UUID, inviteId: UUID, principal: UserPrincipal) {
        val caller = userService.getOrCreateUser(principal)
        val event = requireEvent(eventId)
        requireManage(caller, principal, event)

        val invite = eventInviteRepository.findById(inviteId).orElseThrow {
            ResourceNotFoundException(Msg("error.invite.notFoundById", inviteId), ErrorCode.NOT_FOUND)
        }
        if (invite.event?.id != eventId) {
            throw ResourceNotFoundException(
                Msg("error.invite.notInEvent", inviteId),
                ErrorCode.NOT_FOUND
            )
        }

        if (!invite.revoked) {
            invite.revoked = true
            eventInviteRepository.save(invite)
        }
    }

    /**
     * Löst einen Magic Link ein und legt einen eingeschränkten Gastzugang an.
     * Der Aufruf ist unauthentifiziert; das Rohtoken ist das Geheimnis.
     */
    fun acceptInvite(request: AcceptInviteRequest): AcceptInviteResponse {
        val rawToken = request.token?.trim()
        if (rawToken.isNullOrEmpty()) {
            throw InvalidRequestException(Msg("error.field.blank", "token"), ErrorCode.INVALID_REQUEST)
        }

        val invite = eventInviteRepository.findByTokenHash(SecureTokens.sha256Hex(rawToken)).orElseThrow {
            // Neutrale Meldung ohne Tokenwert; ungültige Links liefern 404.
            ResourceNotFoundException(Msg("error.invite.notFound"), ErrorCode.NOT_FOUND)
        }

        if (invite.revoked) {
            throw InvitationRevokedException(
                Msg("error.invite.revoked"),
                ErrorCode.INVITATION_REVOKED
            )
        }

        val expiresAt = invite.expiresAt
        if (expiresAt != null && !expiresAt.isAfter(Instant.now())) {
            throw InvitationExpiredException(
                Msg("error.invite.expired"),
                ErrorCode.INVITATION_EXPIRED
            )
        }

        val maxUses = invite.maxUses
        if (maxUses != null && invite.usesCount >= maxUses) {
            throw InvitationExpiredException(
                Msg("error.invite.maxUsesReached"),
                ErrorCode.INVITATION_EXPIRED
            )
        }

        val event = invite.event
            ?: throw ResourceNotFoundException(Msg("error.invite.noEvent"), ErrorCode.NOT_FOUND)
        if (event.status == EventStatus.cancelled || event.status == EventStatus.archived) {
            throw EventNotActiveException(
                Msg("error.event.notActive"),
                ErrorCode.EVENT_NOT_ACTIVE
            )
        }

        val rawGuestToken = SecureTokens.generateToken()
        val guestExpiresAt = expiresAt ?: Instant.now().plus(Duration.ofMinutes(DEFAULT_GUEST_TTL_MINUTES))
        val displayName = request.displayName?.trim()?.ifBlank { null } ?: DEFAULT_GUEST_DISPLAY_NAME

        val guest = EventGuestEntity(
            event = event,
            invite = invite,
            guestTokenHash = SecureTokens.sha256Hex(rawGuestToken),
            displayName = displayName,
            status = GuestStatus.active,
            expiresAt = guestExpiresAt
        )
        val savedGuest = eventGuestRepository.save(guest)

        invite.usesCount += 1
        eventInviteRepository.save(invite)

        return AcceptInviteResponse(
            guestToken = rawGuestToken,
            eventId = event.id.toString(),
            eventTitle = event.title,
            displayName = savedGuest.displayName,
            status = savedGuest.status.name,
            expiresAt = savedGuest.expiresAt
        )
    }

    private fun requireEvent(id: UUID): EventEntity =
        eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException(Msg("error.event.notFound", id), ErrorCode.NOT_FOUND)
        }

    /** Einladungen verwalten dürfen ausschließlich der Event-Owner sowie Vorstand/Admin. */
    private fun requireManage(caller: UserEntity, principal: UserPrincipal, event: EventEntity) {
        val allowed = isBoardOrAdmin(caller, principal) || event.owner?.id == caller.id
        if (!allowed) {
            throw AccessDeniedException(
                Msg("error.invite.manageDenied"),
                ErrorCode.ACCESS_DENIED
            )
        }
    }

    private fun isBoardOrAdmin(caller: UserEntity, principal: UserPrincipal): Boolean =
        access.has(principal, caller, Permission.EVENT_INVITES_MANAGE)

    private fun normalizeRole(role: String?): String {
        val trimmed = role?.trim()?.ifBlank { null } ?: return DEFAULT_INVITE_ROLE
        if (trimmed != DEFAULT_INVITE_ROLE) {
            throw InvalidRequestException(Msg("error.invite.invalidRole", trimmed), ErrorCode.INVALID_REQUEST)
        }
        return trimmed
    }

    private fun toInviteDto(invite: EventInviteEntity): InviteDto {
        val expiresAt = invite.expiresAt
        val expired = expiresAt != null && !expiresAt.isAfter(Instant.now())
        val exhausted = invite.maxUses != null && invite.usesCount >= invite.maxUses!!
        val active = !invite.revoked && !expired && !exhausted
        return InviteDto(
            id = invite.id.toString(),
            eventId = invite.event?.id?.toString().orEmpty(),
            role = invite.role,
            maxUses = invite.maxUses,
            usesCount = invite.usesCount,
            expiresAt = expiresAt,
            revoked = invite.revoked,
            active = active,
            createdById = invite.createdBy?.id?.toString(),
            createdAt = invite.createdAt
        )
    }

    companion object {
        const val DEFAULT_INVITE_ROLE = "guest"
        const val DEFAULT_GUEST_DISPLAY_NAME = "Gast"

        /** Standardlaufzeit eines Magic Links: sieben Tage. */
        const val DEFAULT_INVITE_TTL_MINUTES = 7L * 24 * 60

        /** Standardlaufzeit eines Gastzugangs ohne begrenzenden Link: 24 Stunden. */
        const val DEFAULT_GUEST_TTL_MINUTES = 24L * 60

        const val ACCEPT_PATH_PREFIX = "/invite/accept?token="
    }
}
