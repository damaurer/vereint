package de.maurer.baseservice.tenancy

import de.maurer.baseservice.domain.BoardRole
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.MembershipService
import de.maurer.baseservice.service.PlatformService
import org.springframework.beans.factory.annotation.Value
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Component

/**
 * Nur für lokale Entwicklung und E2E-Tests (`vereint.tenancy.bootstrap-realm-roles`):
 * Konten ohne jede Mitgliedschaft treten beim ersten Aufruf dem Stammtisch
 * „Meine Gruppe" bei, mit den Systemrollen aus ihren Keycloak-Realmrollen.
 * So funktionieren die Testbenutzer aus Keycloak ohne Einladungslinks.
 *
 * In Produktion aus: Dort kommt man nur per Einladungslink in einen Stammtisch.
 * Wer den Stammtisch einmal verlassen hat, wird nicht erneut aufgenommen.
 */
@Component
class RealmRoleBootstrap(
    @Value("\${vereint.tenancy.bootstrap-realm-roles:false}") private val enabled: Boolean,
    private val membershipService: MembershipService,
    private val memberRepository: StammtischMemberRepository,
    private val tenantTransactions: TenantTransactions
) {

    fun joinDefault(user: UserEntity, principal: UserPrincipal): Boolean {
        if (!enabled) return false
        val roles = principal.roles.filterTo(mutableSetOf()) { it in RolePermissionMatrix.SYSTEM_ROLES }
            .ifEmpty { mutableSetOf(UserRole.MEMBER) }
        return try {
            tenantTransactions.inStammtisch(PlatformService.DEFAULT_STAMMTISCH_ID) {
                if (memberRepository.findByUserId(user.id).isPresent) return@inStammtisch false
                membershipService.addMember(user, roles)
                BoardRole.fromValue(principal.boardRole)?.let { boardRole ->
                    memberRepository.findByUserId(user.id).ifPresent {
                        it.boardRole = boardRole
                        memberRepository.save(it)
                    }
                }
                true
            }
        } catch (ex: DataIntegrityViolationException) {
            false
        }
    }
}
