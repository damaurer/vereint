package de.maurer.baseservice.security

/**
 * Einzige versionierte Quelle der Rollen-zu-Permission-Zuordnung.
 *
 * Bisher lag die Ableitung dreifach vor (Benutzerdienst, Access Resolver, Express).
 * Diese Matrix ist der verbindliche Stand; der Access Resolver
 * (`AccessResolverService`) und die Express-Variante werden als Folgearbeit auf
 * diese Quelle umgestellt (siehe TICKET-006 bzw. TICKET-009).
 *
 * `VERSION` wird bei jeder inhaltlichen Änderung erhöht, damit Caches und die
 * TypeScript-Gegenstücke abgleichbar bleiben.
 */
object RolePermissionMatrix {

    const val VERSION = 2

    /** Zusätzliche technische Rolle für die Tablet-Erfassung. */
    const val ROLE_TABLET_RECORDER = "tabletRecorder"

    private val MEMBER_PERMISSIONS = setOf(
        Permission.PROFILE_READ_SELF,
        Permission.BALANCE_READ_SELF,
        Permission.PURCHASE_SELF,
        Permission.CHAT_MEMBER,
        Permission.CHAT_EVENT,
        Permission.EVENT_CREATE
    )

    private val BOARD_PERMISSIONS = setOf(
        Permission.PROFILE_READ_SELF,
        Permission.BALANCE_READ_SELF,
        Permission.EVENT_CREATE,
        Permission.EVENT_MANAGE,
        Permission.EVENT_INVITES_MANAGE,
        Permission.CATALOG_PROPOSE,
        Permission.CATALOG_APPROVE,
        Permission.LEDGER_READ,
        Permission.LEDGER_CORRECT,
        Permission.PURCHASE_SELF,
        Permission.CHAT_MEMBER,
        Permission.CHAT_EVENT,
        Permission.AUDIT_READ
    )

    private val ADMIN_PERMISSIONS = BOARD_PERMISSIONS + setOf(Permission.PURCHASE_TABLET)

    private val TABLET_RECORDER_PERMISSIONS = setOf(Permission.PURCHASE_TABLET)

    /** Vollständige Matrix; Schlüssel sind Rollennamen gemäß Datenvertrag. */
    val MATRIX: Map<String, Set<String>> = mapOf(
        UserRole.MEMBER to MEMBER_PERMISSIONS,
        UserRole.BOARD to BOARD_PERMISSIONS,
        UserRole.ADMIN to ADMIN_PERMISSIONS,
        ROLE_TABLET_RECORDER to TABLET_RECORDER_PERMISSIONS
    )

    /** Alle zuweisbaren Rollennamen. */
    val ASSIGNABLE_ROLES: Set<String> = UserRole.ALL + ROLE_TABLET_RECORDER

    /** Alle bekannten Permission-Namen. */
    val KNOWN_PERMISSIONS: Set<String> = MATRIX.values.flatten().toSet()

    fun permissionsForRole(role: String): Set<String> = MATRIX[role] ?: emptySet()

    /**
     * Leitet die effektiven Berechtigungen aus Rollen und dem `drinkRecorder`-Flag ab.
     */
    fun derivePermissions(roles: Set<String>, drinkRecorder: Boolean = false): Set<String> {
        val permissions = roles.flatMapTo(mutableSetOf()) { permissionsForRole(it) }
        if (drinkRecorder) {
            permissions.addAll(TABLET_RECORDER_PERMISSIONS)
        }
        return permissions
    }
}
