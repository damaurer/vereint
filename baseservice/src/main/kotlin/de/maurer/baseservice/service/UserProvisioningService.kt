package de.maurer.baseservice.service

import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Erstanlegen eines Kontos in einer eigenen Transaktion.
 *
 * Dadurch führt eine verlorene Wettlaufsituation (`DataIntegrityViolationException`
 * auf `uk_users_keycloak_subject`) nur zum Rollback dieser inneren Transaktion; der
 * Aufrufer kann anschließend erneut lesen.
 *
 * Ein neues Konto gehört zu keinem Stammtisch und hat keine Rollen. Mitglied
 * wird man über einen Einladungslink oder durch die Plattform-Administration;
 * Keycloak-Rollen aus dem Token werden bewusst nicht übernommen.
 */
@Service
class UserProvisioningService(
    private val userRepository: UserRepository
) {

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun createUser(principal: UserPrincipal): UserEntity {
        val displayName = principal.displayName?.takeIf { it.isNotBlank() }
            ?: (principal.email?.substringBefore("@") ?: "Benutzer")

        val newUser = UserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = principal.subject,
            displayName = displayName,
            email = principal.email,
            disabled = false
        )
        return userRepository.saveAndFlush(newUser)
    }
}
