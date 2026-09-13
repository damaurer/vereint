package de.maurer.baseservice.security

import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Component

/**
 * Einzige Quelle für die Auswertung der Keycloak-Token-Claims im Fachservice.
 *
 * Die unterstützten Claim-Namen sind in `docs/authentifizierung.md` als verbindlicher
 * Vertrag dokumentiert und müssen mit `src/server/auth/oidc.service.ts` übereinstimmen:
 * `sub`, `email`, `name`, `preferred_username`, `realm_access.roles`,
 * `resource_access.<client>.roles`, `roles`, `permissions`, `scope`, `board_role`,
 * `drink_recorder` und `event_scopes`.
 */
@Component
class JwtClaimExtractor {

    fun toPrincipal(jwt: Jwt): UserPrincipal = UserPrincipal(
        subject = extractSubject(jwt),
        email = jwt.getClaimAsString(CLAIM_EMAIL),
        displayName = jwt.getClaimAsString(CLAIM_NAME) ?: jwt.getClaimAsString(CLAIM_PREFERRED_USERNAME),
        roles = extractRoles(jwt),
        permissions = extractPermissions(jwt),
        boardRole = extractBoardRole(jwt),
        drinkRecorder = extractDrinkRecorder(jwt),
        eventScopes = extractEventScopes(jwt),
        attributes = jwt.claims
    )

    fun extractSubject(jwt: Jwt): String =
        jwt.subject ?: jwt.getClaimAsString(CLAIM_SUBJECT) ?: UNKNOWN_SUBJECT

    fun extractBoardRole(jwt: Jwt): String? = jwt.getClaimAsString(CLAIM_BOARD_ROLE)

    fun extractDrinkRecorder(jwt: Jwt): Boolean = jwt.getClaimAsBoolean(CLAIM_DRINK_RECORDER) ?: false

    /**
     * Rollen aus dem flachen `roles`-Claim, aus `realm_access.roles` und aus allen
     * `resource_access.<client>.roles`-Einträgen.
     */
    fun extractRoles(jwt: Jwt): Set<String> {
        val roles = mutableSetOf<String>()

        roles.addAll(asStringSet(jwt.claims[CLAIM_ROLES]))

        (jwt.claims[CLAIM_REALM_ACCESS] as? Map<*, *>)?.let { realmAccess ->
            roles.addAll(asStringSet(realmAccess[NESTED_CLAIM_ROLES]))
        }

        (jwt.claims[CLAIM_RESOURCE_ACCESS] as? Map<*, *>)?.forEach { (_, clientData) ->
            if (clientData is Map<*, *>) {
                roles.addAll(asStringSet(clientData[NESTED_CLAIM_ROLES]))
            }
        }

        return roles
    }

    /**
     * Berechtigungen aus dem `permissions`-Claim sowie aus dem leerzeichengetrennten
     * `scope`-Claim.
     */
    fun extractPermissions(jwt: Jwt): Set<String> {
        val permissions = mutableSetOf<String>()

        permissions.addAll(asStringSet(jwt.claims[CLAIM_PERMISSIONS]))

        (jwt.claims[CLAIM_SCOPE] as? String)?.split(" ")?.filter { it.isNotBlank() }?.let {
            permissions.addAll(it)
        }

        return permissions
    }

    fun extractEventScopes(jwt: Jwt): Set<String> = asStringSet(jwt.claims[CLAIM_EVENT_SCOPES])

    private fun asStringSet(claim: Any?): Set<String> = when (claim) {
        is Collection<*> -> claim.filterIsInstance<String>().toSet()
        is Array<*> -> claim.filterIsInstance<String>().toSet()
        is String -> setOf(claim)
        else -> emptySet()
    }

    companion object {
        const val CLAIM_SUBJECT = "sub"
        const val CLAIM_EMAIL = "email"
        const val CLAIM_NAME = "name"
        const val CLAIM_PREFERRED_USERNAME = "preferred_username"
        const val CLAIM_ROLES = "roles"
        const val CLAIM_REALM_ACCESS = "realm_access"
        const val CLAIM_RESOURCE_ACCESS = "resource_access"
        const val CLAIM_PERMISSIONS = "permissions"
        const val CLAIM_SCOPE = "scope"
        const val CLAIM_BOARD_ROLE = "board_role"
        const val CLAIM_DRINK_RECORDER = "drink_recorder"
        const val CLAIM_EVENT_SCOPES = "event_scopes"
        const val NESTED_CLAIM_ROLES = "roles"
        const val UNKNOWN_SUBJECT = "unknown"
    }
}
