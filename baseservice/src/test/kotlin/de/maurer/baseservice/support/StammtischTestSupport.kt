package de.maurer.baseservice.support

import de.maurer.baseservice.domain.StammtischMemberEntity
import de.maurer.baseservice.domain.StammtischRoleEntity
import de.maurer.baseservice.repository.StammtischMemberRepository
import de.maurer.baseservice.repository.StammtischRoleRepository
import de.maurer.baseservice.repository.UserPermissionRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.tenancy.StammtischAccess
import de.maurer.baseservice.tenancy.StammtischMembers
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.withSettings
import org.mockito.quality.Strictness
import java.util.Optional
import java.util.UUID

/** Hilfen für Unit-Tests mit Mocks: ein Stammtisch mit den Standardrollen. */
object StammtischTestSupport {

    /** Standardrollen wie nach Migration 013 bzw. beim Anlegen eines Stammtischs. */
    fun systemRoles(): List<StammtischRoleEntity> =
        RolePermissionMatrix.MATRIX.map { (code, permissions) ->
            StammtischRoleEntity(code = code, name = code, systemRole = true).apply { assignPermissions(permissions) }
        }

    /**
     * Berechtigungsprüfung mit den Standardrollen; Rollen und individuelle
     * Berechtigungen kommen aus den übergebenen (gemockten) Repositories.
     */
    fun access(
        userRoleRepository: UserRoleRepository = lenientMock(),
        userPermissionRepository: UserPermissionRepository = lenientMock()
    ): StammtischAccess {
        val roleRepository = lenientMock<StammtischRoleRepository>()
        org.mockito.Mockito.`when`(roleRepository.findAll()).thenReturn(systemRoles())
        return StammtischAccess(roleRepository, userRoleRepository, userPermissionRepository)
    }

    /**
     * Mitglieder des Stammtischs für Unit-Tests: alle Konten aus dem
     * (gemockten) [userRepository] gelten als aktive Mitglieder, wie vor der
     * Einführung mehrerer Stammtische.
     */
    fun members(userRepository: UserRepository): StammtischMembers {
        val memberRepository = lenientMock<StammtischMemberRepository>()
        val anyId = any(UUID::class.java) ?: UUID.randomUUID()
        org.mockito.Mockito.`when`(memberRepository.isActiveMember(anyId)).thenReturn(true)
        org.mockito.Mockito.`when`(memberRepository.findByUserId(any(UUID::class.java) ?: UUID.randomUUID())).thenAnswer { invocation ->
            val id = invocation.arguments[0] as UUID
            Optional.of(StammtischMemberEntity(user = userRepository.findById(id).orElse(null)))
        }
        org.mockito.Mockito.`when`(memberRepository.findByActiveTrue()).thenAnswer {
            userRepository.findByDisabled(false).orEmpty().map { StammtischMemberEntity(user = it) }
        }
        org.mockito.Mockito.`when`(memberRepository.findActiveUserIds()).thenAnswer {
            userRepository.findByDisabled(false).orEmpty().map { it.id }
        }
        return StammtischMembers(memberRepository, userRepository)
    }

    inline fun <reified T> lenientMock(): T = mock(T::class.java, withSettings().strictness(Strictness.LENIENT))
}
