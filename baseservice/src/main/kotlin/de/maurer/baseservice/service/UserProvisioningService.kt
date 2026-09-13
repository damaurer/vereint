package de.maurer.baseservice.service

import de.maurer.baseservice.domain.AssignedRole
import de.maurer.baseservice.domain.BoardRole
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.domain.UserRoleEntity
import de.maurer.baseservice.domain.UserRoleId
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

/**
 * Erstanlegen eines Benutzerprofils in einer eigenen Transaktion.
 *
 * Dadurch führt eine verlorene Wettlaufsituation (`DataIntegrityViolationException`
 * auf `uk_users_keycloak_subject`) nur zum Rollback dieser inneren Transaktion; der
 * Aufrufer kann anschließend erneut lesen.
 */
@Service
class UserProvisioningService(
    private val userRepository: UserRepository,
    private val userRoleRepository: UserRoleRepository
) {

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun createUser(principal: UserPrincipal): UserEntity {
        val displayName = principal.displayName?.takeIf { it.isNotBlank() }
            ?: (principal.email?.substringBefore("@") ?: "Benutzer")
        val isDrinkRecorder = principal.drinkRecorder ||
            principal.roles.contains(RolePermissionMatrix.ROLE_TABLET_RECORDER)
        val boardRole = BoardRole.fromValue(principal.boardRole)

        val newUser = UserEntity(
            id = UUID.randomUUID(),
            keycloakSubject = principal.subject,
            displayName = displayName,
            email = principal.email,
            disabled = false,
            drinkRecorder = isDrinkRecorder,
            boardRole = boardRole
        )
        val savedUser = userRepository.saveAndFlush(newUser)

        val rolesToAssign = principal.roles
            .filter { RolePermissionMatrix.ASSIGNABLE_ROLES.contains(it) }
            .mapNotNull { AssignedRole.fromValue(it) }
            .toMutableSet()
        if (rolesToAssign.isEmpty() && !isDrinkRecorder) {
            rolesToAssign.add(AssignedRole.valueOf(UserRole.MEMBER))
        }

        rolesToAssign.forEach { role ->
            userRoleRepository.save(UserRoleEntity(UserRoleId(savedUser.id, role), savedUser))
        }
        userRoleRepository.flush()

        return savedUser
    }
}
