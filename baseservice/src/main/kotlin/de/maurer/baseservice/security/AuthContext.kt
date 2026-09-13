package de.maurer.baseservice.security

import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.PermissionDeniedException
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Component

@Component
class AuthContext(
    private val claimExtractor: JwtClaimExtractor
) {

    fun getCurrentPrincipal(): UserPrincipal? {
        val authentication = SecurityContextHolder.getContext().authentication ?: return null
        if (!authentication.isAuthenticated || authentication is AnonymousAuthenticationToken) {
            return null
        }

        (authentication.details as? UserPrincipal)?.let { return it }

        val principal = authentication.principal
        if (principal is UserPrincipal) {
            return principal
        }

        if (principal is Jwt) {
            val extracted = claimExtractor.toPrincipal(principal)
            return if (extracted.subject == JwtClaimExtractor.UNKNOWN_SUBJECT) {
                extracted.copy(subject = authentication.name)
            } else {
                extracted
            }
        }

        return UserPrincipal(
            subject = authentication.name
        )
    }

    fun getRequiredPrincipal(): UserPrincipal {
        return getCurrentPrincipal() ?: throw AccessDeniedException(
            message = "Authentication is required",
            errorCode = ErrorCode.ACCESS_DENIED
        )
    }

    fun getCurrentSubject(): String? {
        return getCurrentPrincipal()?.subject
    }

    fun getRequiredSubject(): String {
        return getRequiredPrincipal().subject
    }

    fun isAuthenticated(): Boolean {
        val authentication = SecurityContextHolder.getContext().authentication ?: return false
        return authentication.isAuthenticated && authentication !is AnonymousAuthenticationToken
    }

    fun hasRole(role: String): Boolean {
        return getCurrentPrincipal()?.hasRole(role) ?: false
    }

    fun hasPermission(permission: String): Boolean {
        return getCurrentPrincipal()?.hasPermission(permission) ?: false
    }

    fun requireRole(role: String) {
        val principal = getRequiredPrincipal()
        if (!principal.hasRole(role)) {
            throw PermissionDeniedException(
                message = "Required role '$role' is missing",
                errorCode = ErrorCode.PERMISSION_DENIED
            )
        }
    }

    fun requirePermission(permission: String) {
        val principal = getRequiredPrincipal()
        if (!principal.hasPermission(permission)) {
            throw PermissionDeniedException(
                message = "Required permission '$permission' is missing",
                errorCode = ErrorCode.PERMISSION_DENIED
            )
        }
    }
}
