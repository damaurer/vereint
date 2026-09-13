package de.maurer.baseservice

import de.maurer.baseservice.security.Permission
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserRole
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/**
 * Die Matrix ist die einzige versionierte Quelle der Rollen-zu-Permission-Zuordnung.
 */
class RolePermissionMatrixTest {

    @Test
    fun `covers every documented user role`() {
        UserRole.ALL.forEach { role ->
            assertTrue(
                RolePermissionMatrix.permissionsForRole(role).isNotEmpty(),
                "Rolle '$role' besitzt keine Berechtigungen in der Matrix"
            )
        }
    }

    @Test
    fun `members receive only self service permissions`() {
        val memberPermissions = RolePermissionMatrix.permissionsForRole(UserRole.MEMBER)

        assertTrue(memberPermissions.contains(Permission.PROFILE_READ_SELF))
        assertTrue(memberPermissions.contains(Permission.PURCHASE_SELF))
        assertFalse(memberPermissions.contains(Permission.LEDGER_CORRECT))
        assertFalse(memberPermissions.contains(Permission.CATALOG_APPROVE))
        assertFalse(memberPermissions.contains(Permission.PURCHASE_TABLET))
    }

    @Test
    fun `admins hold every board permission plus tablet recording`() {
        val boardPermissions = RolePermissionMatrix.permissionsForRole(UserRole.BOARD)
        val adminPermissions = RolePermissionMatrix.permissionsForRole(UserRole.ADMIN)

        assertTrue(adminPermissions.containsAll(boardPermissions))
        assertTrue(adminPermissions.contains(Permission.PURCHASE_TABLET))
    }

    @Test
    fun `drink recorder flag adds the tablet purchase permission`() {
        val derived = RolePermissionMatrix.derivePermissions(setOf(UserRole.MEMBER), drinkRecorder = true)

        assertTrue(derived.contains(Permission.PURCHASE_TABLET))
        assertTrue(derived.contains(Permission.PURCHASE_SELF))
    }

    @Test
    fun `unknown roles contribute no permissions`() {
        assertTrue(RolePermissionMatrix.permissionsForRole("super_mega_admin").isEmpty())
        assertTrue(RolePermissionMatrix.derivePermissions(setOf("super_mega_admin")).isEmpty())
    }

    @Test
    fun `assignable roles match the documented data contract`() {
        assertEquals(
            setOf("member", "board", "admin", "tabletRecorder"),
            RolePermissionMatrix.ASSIGNABLE_ROLES
        )
    }

    @Test
    fun `tablet recorder role is limited to tablet purchases`() {
        val tabletPermissions = RolePermissionMatrix.permissionsForRole(RolePermissionMatrix.ROLE_TABLET_RECORDER)

        assertEquals(setOf(Permission.PURCHASE_TABLET), tabletPermissions)
        assertFalse(tabletPermissions.contains(Permission.LEDGER_CORRECT))
        assertFalse(tabletPermissions.contains(Permission.LEDGER_READ))
        assertFalse(tabletPermissions.contains(Permission.CATALOG_APPROVE))
        assertFalse(tabletPermissions.contains(Permission.PURCHASE_SELF))
    }

    @Test
    fun `no roles yield no permissions by default`() {
        assertTrue(RolePermissionMatrix.derivePermissions(emptySet()).isEmpty())
        assertTrue(RolePermissionMatrix.derivePermissions(emptySet(), drinkRecorder = false).isEmpty())
    }

    @Test
    fun `derived permissions are the union of all assigned roles`() {
        val combined = RolePermissionMatrix.derivePermissions(setOf(UserRole.MEMBER, UserRole.BOARD))

        assertTrue(combined.containsAll(RolePermissionMatrix.permissionsForRole(UserRole.MEMBER)))
        assertTrue(combined.containsAll(RolePermissionMatrix.permissionsForRole(UserRole.BOARD)))
        assertFalse(combined.contains(Permission.PURCHASE_TABLET))
    }

    @Test
    fun `drink recorder flag alone grants only tablet purchase`() {
        val derived = RolePermissionMatrix.derivePermissions(emptySet(), drinkRecorder = true)

        assertEquals(setOf(Permission.PURCHASE_TABLET), derived)
    }

    @Test
    fun `matrix covers every assignable role and exposes only known permissions`() {
        RolePermissionMatrix.ASSIGNABLE_ROLES.forEach { role ->
            assertTrue(
                RolePermissionMatrix.MATRIX.containsKey(role),
                "Zuweisbare Rolle '$role' fehlt in der Matrix"
            )
        }
        assertEquals(
            RolePermissionMatrix.MATRIX.values.flatten().toSet(),
            RolePermissionMatrix.KNOWN_PERMISSIONS
        )
        assertTrue(RolePermissionMatrix.VERSION >= 1)
    }
}
