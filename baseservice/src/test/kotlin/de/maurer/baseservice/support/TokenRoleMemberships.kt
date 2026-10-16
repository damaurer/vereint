package de.maurer.baseservice.support

import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.StammtischRoleRepository
import de.maurer.baseservice.repository.UserPermissionRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.JwtClaimExtractor
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.tenancy.MembershipView
import de.maurer.baseservice.tenancy.StammtischMemberships
import de.maurer.baseservice.tenancy.TenantTransactions
import org.springframework.context.annotation.Primary
import org.springframework.context.annotation.Profile
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Nur für Tests mit Spring-Kontext (Profil `test`): Die Keycloak-Rollen aus
 * dem Test-Token (`member`, `board`, `admin`, `tabletRecorder`) zählen
 * zusätzlich als Rollen im Standard-Stammtisch. So prüfen die bestehenden
 * Controller-Tests ihre Rollenfälle weiter wie mit einem Stammtisch. Echte
 * Mitgliedschaften (auch in anderen Stammtischen) kommen unverändert hinzu.
 * Ein Token ohne Rollen gilt wie früher beim ersten Login als `member`.
 */
@Component
@Primary
@Profile("test")
class TokenRoleMemberships(
    stammtischRepository: StammtischRepository,
    memberRepository: StammtischMemberRepository,
    roleRepository: StammtischRoleRepository,
    userRoleRepository: UserRoleRepository,
    userPermissionRepository: UserPermissionRepository,
    tenantTransactions: TenantTransactions,
    private val claimExtractor: JwtClaimExtractor
) : StammtischMemberships(
    stammtischRepository,
    memberRepository,
    roleRepository,
    userRoleRepository,
    userPermissionRepository,
    tenantTransactions
) {

    override fun memberships(userId: UUID): List<MembershipView> {
        val real = super.memberships(userId)
        val jwt = SecurityContextHolder.getContext().authentication?.principal as? Jwt ?: return real
        val token = claimExtractor.toPrincipal(jwt)
        val tokenRoles = token.roles.filter { it in RolePermissionMatrix.SYSTEM_ROLES }.toMutableSet()
        if (token.drinkRecorder) tokenRoles.add(RolePermissionMatrix.ROLE_TABLET_RECORDER)
        // Wie früher beim ersten Login: ohne Rollen im Token gilt die Person als Mitglied.
        if (tokenRoles.isEmpty()) tokenRoles.add(UserRole.MEMBER)

        val default = real.firstOrNull { it.stammtischId == DefaultStammtischExtension.DEFAULT_STAMMTISCH_ID }
        val roles = default?.roles.orEmpty() + tokenRoles
        val merged = MembershipView(
            stammtischId = DefaultStammtischExtension.DEFAULT_STAMMTISCH_ID,
            stammtischName = default?.stammtischName ?: "Mein Stammtisch",
            roles = roles,
            permissions = default?.permissions.orEmpty() + RolePermissionMatrix.derivePermissions(roles) + token.permissions,
            boardRole = default?.boardRole ?: token.boardRole
        )
        return listOf(merged) + real.filter { it.stammtischId != DefaultStammtischExtension.DEFAULT_STAMMTISCH_ID }
    }
}
