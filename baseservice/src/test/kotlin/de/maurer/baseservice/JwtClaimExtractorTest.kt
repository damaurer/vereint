package de.maurer.baseservice

import de.maurer.baseservice.security.JwtClaimExtractor
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.security.oauth2.jwt.Jwt
import java.time.Instant

/**
 * Absicherung des Claim-Vertrags aus `docs/authentifizierung.md`.
 */
class JwtClaimExtractorTest {

    private val extractor = JwtClaimExtractor()

    private fun jwt(claims: Map<String, Any>): Jwt {
        val builder = Jwt.withTokenValue("token")
            .header("alg", "RS256")
            .issuedAt(Instant.now())
            .expiresAt(Instant.now().plusSeconds(300))
        claims.forEach { (name, value) -> builder.claim(name, value) }
        return builder.build()
    }

    @Test
    fun `extracts roles from flat claim, realm access and resource access`() {
        val token = jwt(
            mapOf(
                "sub" to "sub-1",
                "roles" to listOf("member"),
                "realm_access" to mapOf("roles" to listOf("board")),
                "resource_access" to mapOf(
                    "vereint-web" to mapOf("roles" to listOf("admin")),
                    "vereint-tablet" to mapOf("roles" to listOf("tabletRecorder"))
                )
            )
        )

        val roles = extractor.extractRoles(token)

        assertEquals(setOf("member", "board", "admin", "tabletRecorder"), roles)
    }

    @Test
    fun `extracts permissions from permissions claim and space separated scope`() {
        val token = jwt(
            mapOf(
                "sub" to "sub-1",
                "permissions" to listOf("ledger.read"),
                "scope" to "profile.read.self purchase.self"
            )
        )

        val permissions = extractor.extractPermissions(token)

        assertEquals(setOf("ledger.read", "profile.read.self", "purchase.self"), permissions)
    }

    @Test
    fun `maps the complete principal including board role, drink recorder and event scopes`() {
        val token = jwt(
            mapOf(
                "sub" to "sub-42",
                "email" to "max@example.com",
                "preferred_username" to "max",
                "board_role" to "treasurer",
                "drink_recorder" to true,
                "event_scopes" to listOf("event-1", "event-2")
            )
        )

        val principal = extractor.toPrincipal(token)

        assertEquals("sub-42", principal.subject)
        assertEquals("max@example.com", principal.email)
        assertEquals("max", principal.displayName)
        assertEquals("treasurer", principal.boardRole)
        assertTrue(principal.drinkRecorder)
        assertEquals(setOf("event-1", "event-2"), principal.eventScopes)
    }

    @Test
    fun `prefers the name claim over preferred username`() {
        val token = jwt(
            mapOf(
                "sub" to "sub-2",
                "name" to "Max Mustermann",
                "preferred_username" to "max"
            )
        )

        assertEquals("Max Mustermann", extractor.toPrincipal(token).displayName)
    }

    @Test
    fun `returns empty sets for missing claims`() {
        val token = jwt(mapOf("sub" to "sub-3"))

        val principal = extractor.toPrincipal(token)

        assertTrue(principal.roles.isEmpty())
        assertTrue(principal.permissions.isEmpty())
        assertTrue(principal.eventScopes.isEmpty())
        assertFalse(principal.drinkRecorder)
        assertNull(principal.boardRole)
    }
}
