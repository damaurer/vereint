package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventGuestEntity
import de.maurer.baseservice.dto.AccessCheckRequest
import de.maurer.baseservice.dto.AccessCheckResponse
import de.maurer.baseservice.dto.AccessDecisionDto
import de.maurer.baseservice.dto.RolePermissionMatrixDto
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.repository.*
import de.maurer.baseservice.security.*
import de.maurer.baseservice.support.Identifiers
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
    private val userRoleRepository: UserRoleRepository,
    private val userPermissionRepository: UserPermissionRepository,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository,
    private val eventGuestRepository: EventGuestRepository
) {

    fun resolveUserAccess(principal: UserPrincipal?): AccessDecisionDto {
        if (principal == null || principal.subject.isBlank()) {
            return AccessDecisionDto(
                subject = "",
                disabled = true,
                allowedAppContexts = emptySet()
            )
        }

        val dbUserOpt = userRepository.findByKeycloakSubject(principal.subject)
        if (dbUserOpt.isPresent) {
            val dbUser = dbUserOpt.get()

            // Deaktivierte Benutzer erhalten keinerlei Rechte (deny by default)
            if (dbUser.disabled) {
                return AccessDecisionDto(
                    subject = principal.subject,
                    userId = dbUser.id.toString(),
                    displayName = dbUser.displayName,
                    email = dbUser.email,
                    disabled = true,
                    roles = emptySet(),
                    boardRole = null,
                    drinkRecorder = false,
                    permissions = emptySet(),
                    eventScopes = emptySet(),
                    ownedEvents = emptySet(),
                    allowedAppContexts = emptySet()
                )
            }

            val dbRoles = userRoleRepository.findByIdUserId(dbUser.id).map { it.id.role.name }.toSet()
            val effectiveRoles = (principal.roles + dbRoles).filter { UserRole.ALL.contains(it) || it == "tabletRecorder" }.toSet()

            // Die Datenbankspalte ist als Enum abgebildet und damit bereits validiert.
            val effectiveBoardRole = when {
                dbUser.boardRole != null -> dbUser.boardRole?.name
                principal.boardRole != null && BoardRole.ALL.contains(principal.boardRole) -> principal.boardRole
                else -> null
            }

            val effectiveDrinkRecorder = dbUser.drinkRecorder || principal.drinkRecorder || effectiveRoles.contains("tabletRecorder")

            val dbPermissions = userPermissionRepository.findByIdUserId(dbUser.id).map { it.id.permission }.toSet()
            val derivedPermissions = derivePermissions(effectiveRoles, effectiveDrinkRecorder)
            val effectivePermissions = (principal.permissions + dbPermissions + derivedPermissions).toSet()

            val ownedEvents = eventRepository.findByOwnerId(dbUser.id).map { it.id.toString() }.toSet()
            val participatingEvents = eventParticipantRepository.findByUserId(dbUser.id)
                .mapNotNull { it.event?.id?.toString() }
                .toSet()
            val effectiveEventScopes = (principal.eventScopes + ownedEvents + participatingEvents).toSet()

            val allowedAppContexts = computeAllowedAppContexts(
                roles = effectiveRoles,
                boardRole = effectiveBoardRole,
                drinkRecorder = effectiveDrinkRecorder,
                eventScopes = effectiveEventScopes,
                ownedEvents = ownedEvents
            )

            return AccessDecisionDto(
                subject = principal.subject,
                userId = dbUser.id.toString(),
                displayName = dbUser.displayName.ifBlank { principal.displayName },
                email = dbUser.email ?: principal.email,
                disabled = false,
                roles = effectiveRoles,
                boardRole = effectiveBoardRole,
                drinkRecorder = effectiveDrinkRecorder,
                permissions = effectivePermissions,
                eventScopes = effectiveEventScopes,
                ownedEvents = ownedEvents,
                allowedAppContexts = allowedAppContexts
            )
        }

        // Falls kein DB-Profil existiert, evaluieren wir die Token-Claims nach deny-by-default-Regeln
        val effectiveRoles = principal.roles.filter { UserRole.ALL.contains(it) || it == "tabletRecorder" }.toSet()
        if (effectiveRoles.isEmpty() && !principal.drinkRecorder) {
            // Fehlende oder unzureichende Rollen -> deny by default
            return AccessDecisionDto(
                subject = principal.subject,
                displayName = principal.displayName,
                email = principal.email,
                disabled = false,
                roles = emptySet(),
                boardRole = null,
                drinkRecorder = false,
                permissions = emptySet(),
                eventScopes = emptySet(),
                ownedEvents = emptySet(),
                allowedAppContexts = emptySet()
            )
        }

        val effectiveBoardRole = principal.boardRole?.takeIf { BoardRole.ALL.contains(it) }
        val effectiveDrinkRecorder = principal.drinkRecorder || effectiveRoles.contains("tabletRecorder")
        val derivedPermissions = derivePermissions(effectiveRoles, effectiveDrinkRecorder)
        val effectivePermissions = (principal.permissions + derivedPermissions).toSet()
        val effectiveEventScopes = principal.eventScopes

        val allowedAppContexts = computeAllowedAppContexts(
            roles = effectiveRoles,
            boardRole = effectiveBoardRole,
            drinkRecorder = effectiveDrinkRecorder,
            eventScopes = effectiveEventScopes,
            ownedEvents = emptySet()
        )

        return AccessDecisionDto(
            subject = principal.subject,
            displayName = principal.displayName,
            email = principal.email,
            disabled = false,
            roles = effectiveRoles,
            boardRole = effectiveBoardRole,
            drinkRecorder = effectiveDrinkRecorder,
            permissions = effectivePermissions,
            eventScopes = effectiveEventScopes,
            ownedEvents = emptySet(),
            allowedAppContexts = allowedAppContexts
        )
    }

    /**
     * Liefert die versionierte Rollen-/Permission-Matrix. Kotlin ist die einzige
     * Quelle dieser Zuordnung; Express wertet die Antwort ausschließlich aus
     * (TICKET-006).
     */
    fun describeRolePermissionMatrix(): RolePermissionMatrixDto = RolePermissionMatrixDto(
        version = RolePermissionMatrix.VERSION,
        roles = RolePermissionMatrix.MATRIX,
        assignableRoles = RolePermissionMatrix.ASSIGNABLE_ROLES,
        knownPermissions = RolePermissionMatrix.KNOWN_PERMISSIONS,
        appContexts = ALL_APP_CONTEXTS
    )

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
        if (decision.roles.contains(UserRole.ADMIN) || decision.roles.contains(UserRole.BOARD)) {
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
        if (decision.roles.contains(UserRole.ADMIN) || decision.roles.contains(UserRole.BOARD)) {
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
     * Die Zuordnung Rolle zu Permission wird ausschließlich aus
     * [RolePermissionMatrix] abgeleitet (einzige Quelle, versioniert).
     */
    private fun derivePermissions(roles: Set<String>, drinkRecorder: Boolean): Set<String> =
        RolePermissionMatrix.derivePermissions(roles, drinkRecorder)

    private fun computeAllowedAppContexts(
        roles: Set<String>,
        boardRole: String?,
        drinkRecorder: Boolean,
        eventScopes: Set<String>,
        ownedEvents: Set<String>
    ): Set<String> {
        val contexts = mutableSetOf<String>()

        val isMember = roles.contains(UserRole.MEMBER)
        val isBoard = roles.contains(UserRole.BOARD)
        val isAdmin = roles.contains(UserRole.ADMIN)

        if (isMember || isBoard || isAdmin) {
            contexts.add(AppContext.MEMBER_PWA)
        }

        if (isBoard || isAdmin || eventScopes.isNotEmpty()) {
            contexts.add(AppContext.EVENT)
        }

        if (isBoard || isAdmin || ownedEvents.isNotEmpty()) {
            contexts.add(AppContext.EVENT_OWNER)
        }

        if (isBoard || isAdmin) {
            contexts.add(AppContext.BOARD_GENERAL)
        }

        if (isAdmin || (isBoard && (boardRole == BoardRole.TREASURER || boardRole == BoardRole.CHAIR || boardRole == null))) {
            contexts.add(AppContext.BOARD_TREASURY)
        }

        if (isAdmin || (isBoard && (boardRole == BoardRole.SECRETARY || boardRole == BoardRole.CHAIR || boardRole == null))) {
            contexts.add(AppContext.BOARD_COMMUNICATIONS)
        }

        if (isAdmin) {
            contexts.add(AppContext.ADMIN)
        }

        if (drinkRecorder) {
            contexts.add(AppContext.TABLET_RECORDER)
        }

        return contexts
    }

    private fun sha256(value: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    companion object {
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
