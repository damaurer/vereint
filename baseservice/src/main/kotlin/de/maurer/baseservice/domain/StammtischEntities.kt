package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.time.Instant
import java.util.UUID

/**
 * Ein Stammtisch: abgeschlossener Bereich mit eigenen Mitgliedern, Rollen,
 * Events, Chats, Guthaben, Katalog und Moments. Die Tabelle selbst gehört
 * keinem Stammtisch.
 */
@Entity
@Table(name = "stammtische")
@EntityListeners(AuditingEntityListener::class)
class StammtischEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "name", length = 80, nullable = false)
    var name: String = "",

    /** Archivierte Stammtische sind für niemanden mehr erreichbar; ihre Daten bleiben erhalten. */
    @Column(name = "archived", nullable = false)
    var archived: Boolean = false,

    /** Konto, das den Stammtisch eröffnet hat; `null` für den Stammtisch aus der Migration. */
    @Column(name = "created_by")
    var createdBy: UUID? = null,

    /** Gruppenbild im Objektspeicher (verschlüsselt); `null` ohne Bild. */
    @Column(name = "image_key", length = 255)
    var imageKey: String? = null,

    @Column(name = "image_content_type", length = 64)
    var imageContentType: String? = null,

    /** Steigt mit jedem neuen Bild; die App hängt sie an die Bild-URL. */
    @Column(name = "image_version", nullable = false)
    var imageVersion: Int = 0,

    /** „Statistik in dieser Gruppe“: aus heißt, in der Gruppe und ihren Events wird nichts erfasst. */
    @Column(name = "statistics_enabled", nullable = false)
    var statisticsEnabled: Boolean = true,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
)

/**
 * Mitgliedschaft einer Person in einem Stammtisch. Ein Konto kann in beliebig
 * vielen Stammtischen Mitglied sein, mit je eigenen Rollen (`user_roles`).
 * Eine beendete Mitgliedschaft (`active = false`) behält ihre Buchungen.
 */
@Entity
@Table(name = "stammtisch_members")
@EntityListeners(AuditingEntityListener::class)
class StammtischMemberEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, updatable = false)
    var user: UserEntity? = null,

    @Column(name = "active", nullable = false)
    var active: Boolean = true,

    /** Vorstandsfunktion im Stammtisch (Vorsitz, Kasse, ...); nur eine Bezeichnung. */
    @Enumerated(EnumType.STRING)
    @Column(name = "board_role", length = 32)
    var boardRole: BoardRole? = null,

    @CreatedDate
    @Column(name = "joined_at", nullable = false, updatable = false)
    var joinedAt: Instant = Instant.now(),

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped()

/**
 * Rolle eines Stammtischs mit ihren Berechtigungen.
 *
 * Die Systemrollen `member`, `board`, `admin` und `tabletRecorder` legt jeder
 * Stammtisch beim Anlegen an; ihre Berechtigungen sind änderbar, sie selbst
 * lassen sich nicht löschen. Eigene Rollen (z. B. „Kassenprüfung“) legt die
 * Rollenverwaltung des Stammtischs an.
 */
@Entity
@Table(name = "stammtisch_roles")
@EntityListeners(AuditingEntityListener::class)
class StammtischRoleEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "code", length = 64, nullable = false, updatable = false)
    var code: String = "",

    @Column(name = "name", length = 64, nullable = false)
    var name: String = "",

    @Column(name = "description", length = 255)
    var description: String? = null,

    /** Berechtigungen, durch Komma getrennt (siehe [de.maurer.baseservice.security.Permission]). */
    @Column(name = "permissions", length = 2000, nullable = false)
    var permissions: String = "",

    @Column(name = "system_role", nullable = false, updatable = false)
    var systemRole: Boolean = false,

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped() {

    fun permissionSet(): Set<String> =
        permissions.split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()

    fun assignPermissions(values: Collection<String>) {
        permissions = values.map { it.trim() }.filter { it.isNotEmpty() }.toSortedSet().joinToString(",")
    }
}
