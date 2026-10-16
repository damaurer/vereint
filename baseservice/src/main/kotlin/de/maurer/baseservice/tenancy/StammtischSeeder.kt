package de.maurer.baseservice.tenancy

import de.maurer.baseservice.domain.MomentReactionEntity
import de.maurer.baseservice.domain.MomentTypeEntity
import de.maurer.baseservice.domain.StammtischRoleEntity
import de.maurer.baseservice.repository.MomentReactionRepository
import de.maurer.baseservice.repository.MomentTypeRepository
import de.maurer.baseservice.repository.StammtischRoleRepository
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.security.UserRole
import org.springframework.stereotype.Component

/**
 * Startbestand eines neuen Stammtischs: die vier Systemrollen sowie die
 * Moment-Typen und -Reaktionen, mit denen auch der erste Stammtisch gestartet
 * ist (Migrationen 012 und 013). Läuft im Kontext des neuen Stammtischs.
 */
@Component
class StammtischSeeder(
    private val roleRepository: StammtischRoleRepository,
    private val momentTypeRepository: MomentTypeRepository,
    private val momentReactionRepository: MomentReactionRepository
) {

    fun seed() {
        TenantContext.requireStammtischId()
        SYSTEM_ROLES.forEach { (code, name, description, sortOrder) ->
            roleRepository.save(
                StammtischRoleEntity(
                    code = code,
                    name = name,
                    description = description,
                    systemRole = true,
                    sortOrder = sortOrder
                ).apply { assignPermissions(RolePermissionMatrix.permissionsForRole(code)) }
            )
        }
        MOMENT_TYPES.forEachIndexed { index, (code, name, emoji, description) ->
            momentTypeRepository.save(
                MomentTypeEntity(code = code, name = name, emoji = emoji, description = description, sortOrder = (index + 1) * 10)
            )
        }
        MOMENT_REACTIONS.forEachIndexed { index, (code, name, emoji) ->
            momentReactionRepository.save(
                MomentReactionEntity(code = code, name = name, emoji = emoji, sortOrder = (index + 1) * 10)
            )
        }
        roleRepository.flush()
    }

    private data class RoleSeed(val code: String, val name: String, val description: String, val sortOrder: Int)

    companion object {
        private val SYSTEM_ROLES = listOf(
            RoleSeed(UserRole.MEMBER, "Mitglied", "Alle Mitglieder des Stammtischs", 10),
            RoleSeed(UserRole.BOARD, "Vorstand", "Organisiert Events, Kasse und Katalog", 20),
            RoleSeed(UserRole.ADMIN, "Admin", "Verwaltet Mitglieder, Rollen und den Stammtisch", 30),
            RoleSeed(RolePermissionMatrix.ROLE_TABLET_RECORDER, "Theke", "Konto für das Thekenterminal", 40)
        )

        private val MOMENT_TYPES = listOf(
            listOf("toast", "Gemeinsames Anstoßen", "🍻", "Für Stammtische & Feste"),
            listOf("prayer", "Gebet & Fürbitte", "🙏", "Für Kirchen- & Glaubensgemeinschaften"),
            listOf("cheer", "Jubeln & Anfeuern", "📣", "Für Sport- & Fan-Clubs"),
            listOf("checkin", "Spontaner Check-in", "📍", "Präsenz & Standort teilen"),
            listOf("other", "Sonstiger Impuls", "✨", "Freie Gemeinschaftsaktion")
        )

        private val MOMENT_REACTIONS = listOf(
            listOf("TOAST", "Anstoßen", "🍻"),
            listOf("PRAYER", "Gebet", "🙏"),
            listOf("CHEER", "Jubel", "📣"),
            listOf("THUMBS_UP", "Daumen hoch", "👍"),
            listOf("CELEBRATE", "Feiern", "🎉"),
            listOf("HEART", "Herz", "❤️")
        )
    }
}
