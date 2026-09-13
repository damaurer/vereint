package de.maurer.baseservice

import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.PermissionDeniedException
import de.maurer.baseservice.security.AuthContext
import de.maurer.baseservice.security.JwtClaimExtractor
import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder

class AuthContextTest {

    private val authContext = AuthContext(JwtClaimExtractor())

    @AfterEach
    fun clearSecurityContext() {
        SecurityContextHolder.clearContext()
    }

    @Test
    fun `returns null and false when unauthenticated`() {
        assertNull(authContext.getCurrentPrincipal())
        assertNull(authContext.getCurrentSubject())
        assertFalse(authContext.isAuthenticated())
        assertFalse(authContext.hasRole(UserRole.MEMBER))
        assertFalse(authContext.hasPermission(Permission.PROFILE_READ_SELF))
        assertThrows<AccessDeniedException> { authContext.getRequiredPrincipal() }
        assertThrows<AccessDeniedException> { authContext.getRequiredSubject() }
    }

    @Test
    fun `resolves authenticated principal correctly`() {
        val principal = UserPrincipal(
            subject = "sub-456",
            email = "user@vereint.de",
            displayName = "Erika Muster",
            roles = setOf(UserRole.MEMBER, UserRole.BOARD),
            permissions = setOf(Permission.PROFILE_READ_SELF, Permission.EVENT_CREATE)
        )
        val auth = UsernamePasswordAuthenticationToken(principal, "n/a", emptyList())
        SecurityContextHolder.getContext().authentication = auth

        assertTrue(authContext.isAuthenticated())
        assertEquals("sub-456", authContext.getCurrentSubject())
        assertEquals("sub-456", authContext.getRequiredSubject())
        assertEquals("user@vereint.de", authContext.getRequiredPrincipal().email)
        assertTrue(authContext.hasRole(UserRole.MEMBER))
        assertTrue(authContext.hasRole(UserRole.BOARD))
        assertFalse(authContext.hasRole(UserRole.ADMIN))
        assertTrue(authContext.hasPermission(Permission.PROFILE_READ_SELF))
        assertTrue(authContext.hasPermission(Permission.EVENT_CREATE))
        assertFalse(authContext.hasPermission(Permission.LEDGER_CORRECT))

        assertDoesNotThrow { authContext.requireRole(UserRole.MEMBER) }
        assertDoesNotThrow { authContext.requirePermission(Permission.EVENT_CREATE) }

        assertThrows<PermissionDeniedException> { authContext.requireRole(UserRole.ADMIN) }
        assertThrows<PermissionDeniedException> { authContext.requirePermission(Permission.LEDGER_CORRECT) }
    }
}
