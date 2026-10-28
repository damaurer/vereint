package de.maurer.baseservice.security

/**
 * Standardrollen eines Stammtischs und ihre Berechtigungen beim Anlegen.
 *
 * Jeder Stammtisch erhält beim Anlegen diese vier Systemrollen. Danach gelten
 * ausschließlich die Berechtigungen aus `stammtisch_roles`: die
 * Rollenverwaltung des Stammtischs kann sie ändern und eigene Rollen anlegen
 * (siehe `StammtischAccess`). Die Migration `013-stammtische.xml` legt
 * dieselben Werte für den Standard-Stammtisch an.
 *
 * `VERSION` wird bei jeder inhaltlichen Änderung erhöht, damit Caches und die
 * TypeScript-Gegenstücke abgleichbar bleiben.
 */
object RolePermissionMatrix {

    const val VERSION = 4

    /** Zusätzliche technische Rolle für die Tablet-Erfassung (Thekenterminal). */
    const val ROLE_TABLET_RECORDER = "tabletRecorder"

    private val MEMBER_PERMISSIONS = setOf(
        Permission.PROFILE_READ_SELF,
        Permission.BALANCE_READ_SELF,
        Permission.PURCHASE_SELF,
        Permission.CHAT_MEMBER,
        Permission.CHAT_EVENT,
        Permission.EVENT_CREATE,
        Permission.CATALOG_PROPOSE
    )

    private val BOARD_PERMISSIONS = MEMBER_PERMISSIONS + setOf(
        Permission.EVENT_MANAGE,
        Permission.EVENT_INVITES_MANAGE,
        Permission.CATALOG_APPROVE,
        Permission.LEDGER_READ,
        Permission.LEDGER_CORRECT,
        Permission.AUDIT_READ,
        Permission.MEMBERS_READ,
        Permission.MEMBERS_INVITE,
        Permission.MOMENTS_MANAGE,
        Permission.KIOSK_MANAGE,
        Permission.NOTIFICATIONS_BROADCAST,
        Permission.CHAT_MODERATE
    )

    private val ADMIN_PERMISSIONS = BOARD_PERMISSIONS + setOf(
        Permission.PURCHASE_TABLET,
        Permission.MEMBERS_MANAGE,
        Permission.ROLES_MANAGE,
        Permission.STAMMTISCH_MANAGE,
        Permission.AUDIT_READ_ALL
    )

    private val TABLET_RECORDER_PERMISSIONS = setOf(Permission.PURCHASE_TABLET)

    /** Systemrollen eines neuen Stammtischs; Schlüssel sind die Rollen-Codes. */
    val MATRIX: Map<String, Set<String>> = linkedMapOf(
        UserRole.MEMBER to MEMBER_PERMISSIONS,
        UserRole.BOARD to BOARD_PERMISSIONS,
        UserRole.ADMIN to ADMIN_PERMISSIONS,
        ROLE_TABLET_RECORDER to TABLET_RECORDER_PERMISSIONS
    )

    /** Codes der Systemrollen. */
    val SYSTEM_ROLES: Set<String> = MATRIX.keys

    /** Alle bekannten Permission-Namen. */
    val KNOWN_PERMISSIONS: Set<String> = Permission.ALL

    fun permissionsForRole(role: String): Set<String> = MATRIX[role] ?: emptySet()

    /** Standardberechtigungen der angegebenen Systemrollen. */
    fun derivePermissions(roles: Set<String>): Set<String> =
        roles.flatMapTo(mutableSetOf()) { permissionsForRole(it) }
}
