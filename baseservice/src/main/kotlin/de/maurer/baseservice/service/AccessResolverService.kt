package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventGuestEntity
import de.maurer.baseservice.dto.AccessCheckRequest
import de.maurer.baseservice.dto.AccessCheckResponse
import de.maurer.baseservice.dto.AccessDecisionDto
import de.maurer.baseservice.dto.RolePermissionMatrixDto
import de.maurer.baseservice.dto.StammtischMembershipDto
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.repository.*
import de.maurer.baseservice.security.*
import de.maurer.baseservice.support.Identifiers
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.StammtischMemberships
import de.maurer.baseservice.tenancy.TenantContext
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

@Service
@Transactional(readOnly = true)
class AccessResolverService(
    private val userRepository: UserRepository,
    private val access: StammtischAccess,
    private val memberships: StammtischMemberships,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val eventGuestRepository: EventGuestRepository
) {

    /**
     * Zugriffsentscheidung im aktuellen Stammtisch.
     *
     * Rollen, Berechtigungen und Vorstandsfunktion stammen aus dem Principal,
     * den der [de.maurer.baseservice.tenancy.StammtischContextFilter] bereits
     * auf den gewählten Stammtisch umgestellt hat. Ohne gewählten Stammtisch
     * gibt es nur die Liste der Mitgliedschaften und keine App-Kontexte.
     */
    fun resolveUserAccess(principal: UserPrincipal?): AccessDecisionDto {
        if (principal == null || principal.subject.isBlank()) {
            return AccessDecisionDto(
                subject = "",
                disabled = true,
                allowedAppContexts = emptySet()
            )
        }

        val dbUser = userRepository.findByKeycloakSubject(principal.subject).orElse(null)
            ?: return AccessDecisionDto(
                subject = principal.subject,
                displayName = principal.displayName,
                email = principal.email,
                platformAdmin = principal.platformAdmin
            )

        // Deaktivierte Benutzer erhalten keinerlei Rechte (deny by default)
        if (dbUser.disabled) {
            return AccessDecisionDto(
                subject = principal.subject,
                userId = dbUser.id.toString(),
                displayName = dbUser.displayName,
                email = dbUser.email,
                disabled = true
            )
        }

        val memberships = memberships.memberships(dbUser.id).map {
            StammtischMembershipDto(
                id = it.stammtischId.toString(),
                name = it.stammtischName,
                roles = it.roles,
                boardRole = it.boardRole,
                imageVersion = it.imageVersion
            )
        }
        val stammtischId = TenantContext.stammtischId()
        val current = stammtischId?.let { id -> memberships.firstOrNull { it.id == id.toString() } }

        if (current == null) {
            return AccessDecisionDto(
                subject = principal.subject,
                userId = dbUser.id.toString(),
                displayName = dbUser.displayName.ifBlank { principal.displayName },
                email = dbUser.email ?: principal.email,
                platformAdmin = principal.platformAdmin,
                memberships = memberships
            )
        }

        val roles = principal.roles
        val permissions = access.permissionsOf(principal, dbUser)
        val ownedEvents = eventRepository.findByOwnerId(dbUser.id).map { it.id.toString() }.toSet()
        val participatingEvents = eventParticipantRepository.findByUserId(dbUser.id)
            .mapNotNull { it.event?.id?.toString() }
            .toSet()
        val eventScopes = ownedEvents + participatingEvents

        return AccessDecisionDto(
            subject = principal.subject,
            userId = dbUser.id.toString(),
            displayName = dbUser.displayName.ifBlank { principal.displayName },
            email = dbUser.email ?: principal.email,
            disabled = false,
            roles = roles,
            boardRole = principal.boardRole,
            drinkRecorder = permissions.contains(Permission.PURCHASE_TABLET),
            permissions = permissions,
            eventScopes = eventScopes,
            ownedEvents = ownedEvents,
            allowedAppContexts = computeAllowedAppContexts(permissions, eventScopes, ownedEvents),
            stammtischId = current.id,
            stammtischName = current.name,
            platformAdmin = principal.platformAdmin,
            memberships = memberships
        )
    }

    /**
     * Rollen und Berechtigungen des aktuellen Stammtischs. Ohne Stammtisch
     * liefert der Endpunkt die Standardrollen, mit denen neue Stammtische
     * starten.
     */
    fun describeRolePermissionMatrix(): RolePermissionMatrixDto {
        val definitions = access.roleDefinitions().ifEmpty { RolePermissionMatrix.MATRIX }
        return RolePermissionMatrixDto(
            version = RolePermissionMatrix.VERSION,
            roles = definitions,
            assignableRoles = definitions.keys,
            knownPermissions = RolePermissionMatrix.KNOWN_PERMISSIONS,
            appContexts = ALL_APP_CONTEXTS
        )
    }

    fun checkAccess(request: AccessCheckRequest, principal: UserPrincipal?): AccessCheckResponse {
        val targetContext = request.appContext.trim()

        // 1. Gast-Kontext (/guest/:eventId)
        if (targetContext == AppContext.EVENT_GUEST) {
            return validateGuestAccess(request.eventId, request.guestToken)
        }

        // 2. Reguläre authentifizierte Kontexte
        if (principal == null || principal.subject.isBlank()) {
            return AccessCheckResponse(
                allowed = false,
                reason = "Authentication is required",
                errorCode = ErrorCode.ACCESS_DENIED,
                appContext = targetContext,
                eventId = request.eventId
            )
        }

        val decision = resolveUserAccess(principal)

        if (decision.disabled) {
            return AccessCheckResponse(
                allowed = false,
                reason = "User account is disabled",
                errorCode = ErrorCode.ACCOUNT_DISABLED,
                appContext = targetContext,
                eventId = request.eventId
            )
        }

        // Spezifische Permission-Prüfung falls angefordert
        if (!request.permission.isNullOrBlank() && !decision.permissions.contains(request.permission)) {
            return AccessCheckResponse(
                allowed = false,
                reason = "Required permission '${request.permission}' is missing",
                errorCode = ErrorCode.PERMISSION_DENIED,
                appContext = targetContext,
                eventId = request.eventId
            )
        }

        // Kontext- und ressourcenbezogene Prüfungen
        val isAllowed = when (targetContext) {
            AppContext.MEMBER_PWA -> decision.allowedAppContexts.contains(AppContext.MEMBER_PWA)

            AppContext.BOARD_GENERAL -> decision.allowedAppContexts.contains(AppContext.BOARD_GENERAL)

            AppContext.BOARD_TREASURY -> decision.allowedAppContexts.contains(AppContext.BOARD_TREASURY)

            AppContext.BOARD_COMMUNICATIONS -> decision.allowedAppContexts.contains(AppContext.BOARD_COMMUNICATIONS)

            AppContext.ADMIN -> decision.allowedAppContexts.contains(AppContext.ADMIN)

            AppContext.TABLET_RECORDER -> decision.allowedAppContexts.contains(AppContext.TABLET_RECORDER)

            AppContext.EVENT -> {
                if (request.eventId.isNullOrBlank()) {
                    decision.allowedAppContexts.contains(AppContext.EVENT)
                } else {
                    canAccessEvent(decision, Identifiers.parseUuid(request.eventId, "eventId"))
                }
            }

            AppContext.EVENT_OWNER -> {
                if (request.eventId.isNullOrBlank()) {
                    decision.allowedAppContexts.contains(AppContext.EVENT_OWNER)
                } else {
                    canManageEvent(decision, Identifiers.parseUuid(request.eventId, "eventId"))
                }
            }

            else -> false // Unbekannter Kontext -> Deny by default
        }

        return if (isAllowed) {
            AccessCheckResponse(
                allowed = true,
                reason = "Access granted",
                appContext = targetContext,
                eventId = request.eventId
            )
        } else {
            AccessCheckResponse(
                allowed = false,
                reason = "Access to context '$targetContext' denied",
                errorCode = ErrorCode.ACCESS_DENIED,
                appContext = targetContext,
                eventId = request.eventId
            )
        }
    }

    fun validateGuestAccess(eventId: String?, guestToken: String?): AccessCheckResponse {
        if (eventId.isNullOrBlank() || guestToken.isNullOrBlank()) {
            return AccessCheckResponse(
                allowed = false,
                reason = "Event ID and guest token are required for guest access",
                errorCode = ErrorCode.ACCESS_DENIED,
                appContext = AppContext.EVENT_GUEST,
                eventId = eventId
            )
        }

        val eventKey = Identifiers.parseUuid(eventId, "eventId")

        val eventOpt = eventRepository.findById(eventKey)
        if (eventOpt.isEmpty) {
            return AccessCheckResponse(
                allowed = false,
                reason = "Event not found",
                errorCode = ErrorCode.NOT_FOUND,
                appContext = AppContext.EVENT_GUEST,
                eventId = eventId
            )
        }

        val event = eventOpt.get()
        if (event.status.name == EventStatus.CANCELLED || event.status.name == EventStatus.ARCHIVED) {
            return AccessCheckResponse(
                allowed = false,
                reason = "Event is not active",
                errorCode = ErrorCode.EVENT_NOT_ACTIVE,
                appContext = AppContext.EVENT_GUEST,
                eventId = eventId
            )
        }

        val tokenHash = sha256(guestToken.trim())
        val guestOpt = eventGuestRepository.findByGuestTokenHash(tokenHash)
        if (guestOpt.isEmpty) {
            return AccessCheckResponse(
                allowed = false,
                reason = "Invalid guest token",
                errorCode = ErrorCode.ACCESS_DENIED,
                appContext = AppContext.EVENT_GUEST,
                eventId = eventId
            )
        }

        val guest: EventGuestEntity = guestOpt.get()
        if (guest.event?.id != eventKey) {
            return AccessCheckResponse(
                allowed = false,
                reason = "Guest token is not valid for the requested event",
                errorCode = ErrorCode.ACCESS_DENIED,
                appContext = AppContext.EVENT_GUEST,
                eventId = eventId
            )
        }

        if (guest.status.name == GuestStatus.REVOKED) {
            return AccessCheckResponse(
                allowed = false,
                reason = "Guest access has been revoked",
                errorCode = ErrorCode.INVITATION_REVOKED,
                appContext = AppContext.EVENT_GUEST,
                eventId = eventId
            )
        }

        if (guest.status.name == GuestStatus.EXPIRED || guest.expiresAt.isBefore(Instant.now())) {
            return AccessCheckResponse(
                allowed = false,
                reason = "Guest access has expired",
                errorCode = ErrorCode.INVITATION_EXPIRED,
                appContext = AppContext.EVENT_GUEST,
                eventId = eventId
            )
        }

        if (guest.status.name != GuestStatus.ACTIVE) {
            return AccessCheckResponse(
                allowed = false,
                reason = "Guest status is not active",
                errorCode = ErrorCode.ACCESS_DENIED,
                appContext = AppContext.EVENT_GUEST,
                eventId = eventId
            )
        }

        return AccessCheckResponse(
            allowed = true,
            reason = "Guest access granted",
            appContext = AppContext.EVENT_GUEST,
            eventId = eventId
        )
    }

    private fun canAccessEvent(decision: AccessDecisionDto, eventId: UUID): Boolean {
        if (decision.permissions.contains(Permission.EVENT_MANAGE)) {
            return true
        }
        if (decision.eventScopes.contains(eventId.toString())) {
            return true
        }
        val callerId = Identifiers.parseUuidOrNull(decision.userId)
        if (callerId != null) {
            val participantOpt = eventParticipantRepository.findByEventIdAndUserId(eventId, callerId)
            if (participantOpt.isPresent) return true

            val eventOpt = eventRepository.findById(eventId)
            if (eventOpt.isPresent && eventOpt.get().owner?.id == callerId) {
                return true
            }
        }
        return false
    }

    private fun canManageEvent(decision: AccessDecisionDto, eventId: UUID): Boolean {
        if (decision.permissions.contains(Permission.EVENT_MANAGE)) {
            return true
        }
        val callerId = Identifiers.parseUuidOrNull(decision.userId)
        if (callerId != null) {
            val eventOpt = eventRepository.findById(eventId)
            if (eventOpt.isPresent && eventOpt.get().owner?.id == callerId) {
                return true
            }
        }
        return false
    }

    /**
     * App-Kontexte folgen allein aus den Berechtigungen im Stammtisch, damit
     * eigene Rollen eines Stammtischs dieselben Bereiche öffnen können wie die
     * Standardrollen.
     */
    private fun computeAllowedAppContexts(
        permissions: Set<String>,
        eventScopes: Set<String>,
        ownedEvents: Set<String>
    ): Set<String> {
        val contexts = mutableSetOf<String>()
        val eventManager = permissions.contains(Permission.EVENT_MANAGE)

        if (permissions.contains(Permission.PROFILE_READ_SELF)) contexts.add(AppContext.MEMBER_PWA)
        if (eventManager || eventScopes.isNotEmpty()) contexts.add(AppContext.EVENT)
        if (eventManager || ownedEvents.isNotEmpty()) contexts.add(AppContext.EVENT_OWNER)
        if (permissions.any { it in BOARD_AREA_PERMISSIONS }) contexts.add(AppContext.BOARD_GENERAL)
        if (permissions.contains(Permission.LEDGER_READ) || permissions.contains(Permission.LEDGER_CORRECT)) {
            contexts.add(AppContext.BOARD_TREASURY)
        }
        if (permissions.contains(Permission.NOTIFICATIONS_BROADCAST)) contexts.add(AppContext.BOARD_COMMUNICATIONS)
        if (permissions.any { it in ADMIN_AREA_PERMISSIONS }) contexts.add(AppContext.ADMIN)
        if (permissions.contains(Permission.PURCHASE_TABLET)) contexts.add(AppContext.TABLET_RECORDER)
        return contexts
    }

    private fun sha256(value: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    companion object {
        /** Berechtigungen, die den Vorstandsbereich öffnen. */
        private val BOARD_AREA_PERMISSIONS = setOf(
            Permission.EVENT_MANAGE,
            Permission.EVENT_INVITES_MANAGE,
            Permission.CATALOG_APPROVE,
            Permission.LEDGER_READ,
            Permission.LEDGER_CORRECT,
            Permission.AUDIT_READ,
            Permission.MEMBERS_READ,
            Permission.MEMBERS_INVITE,
            Permission.MOMENTS_MANAGE,
            Permission.KIOSK_MANAGE,
            Permission.NOTIFICATIONS_BROADCAST
        )

        /** Berechtigungen, die den Admin-Bereich öffnen. */
        private val ADMIN_AREA_PERMISSIONS = setOf(
            Permission.MEMBERS_MANAGE,
            Permission.ROLES_MANAGE,
            Permission.STAMMTISCH_MANAGE
        )

        /** Alle bekannten App-Kontexte gemäß Datenvertrag. */
        val ALL_APP_CONTEXTS: Set<String> = setOf(
            AppContext.MEMBER_PWA,
            AppContext.EVENT,
            AppContext.EVENT_OWNER,
            AppContext.BOARD_GENERAL,
            AppContext.BOARD_TREASURY,
            AppContext.BOARD_COMMUNICATIONS,
            AppContext.ADMIN,
            AppContext.TABLET_RECORDER,
            AppContext.EVENT_GUEST
        )
    }
}
