package de.maurer.baseservice.support

import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.MembershipService
import de.maurer.baseservice.service.UserProvisioningService
import de.maurer.baseservice.tenancy.TenantTransactions
import org.springframework.context.annotation.Primary
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

/**
 * Nur für Tests mit Spring-Kontext (Profil `test`): Neue Konten werden wie vor
 * der Einführung mehrerer Stammtische sofort Mitglied des Standard-Stammtischs,
 * mit den Keycloak-Rollen aus dem Token (ohne Rollen: `member`). Die
 * bestehenden Tests legen ihre Personen so weiter einfach per Login an.
 * Produktiv entsteht eine Mitgliedschaft nur per Einladungslink oder durch die
 * Plattform-Administration.
 */
@Service
@Primary
@Profile("test")
class DefaultStammtischProvisioning(
    userRepository: UserRepository,
    private val membershipService: MembershipService,
    private val tenantTransactions: TenantTransactions
) : UserProvisioningService(userRepository) {

    /** Ohne umgebende Transaktion: das Konto muss gespeichert sein, bevor die Mitgliedschaft darauf zeigt. */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    override fun createUser(principal: UserPrincipal): UserEntity {
        val user = super.createUser(principal)
        val roles = principal.roles.filter { it in RolePermissionMatrix.SYSTEM_ROLES }.toMutableSet()
        if (principal.drinkRecorder) roles.add(RolePermissionMatrix.ROLE_TABLET_RECORDER)
        if (roles.isEmpty()) roles.add(UserRole.MEMBER)
        tenantTransactions.inStammtisch(DefaultStammtischExtension.DEFAULT_STAMMTISCH_ID) {
            membershipService.addMember(user, roles)
        }
        return user
    }
}
