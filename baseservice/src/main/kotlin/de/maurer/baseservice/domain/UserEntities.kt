package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.io.Serializable
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "users")
@EntityListeners(AuditingEntityListener::class)
class UserEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "keycloak_subject", length = 64, nullable = false, unique = true)
    var keycloakSubject: String = "",

    @Column(name = "email", length = 255)
    var email: String? = null,

    @Column(name = "display_name", length = 255, nullable = false)
    var displayName: String = "",

    @Column(name = "disabled", nullable = false)
    var disabled: Boolean = false,

    @Column(name = "drink_recorder", nullable = false)
    var drinkRecorder: Boolean = false,

    /**
     * Zulässige Werte gemäß [BoardRole]; die Datenbank erzwingt sie über
     * `ck_users_board_role`.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "board_role", length = 32)
    var boardRole: BoardRole? = null,

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

@Embeddable
data class UserRoleId(
    @Column(name = "user_id", nullable = false)
    var userId: UUID = UUID.randomUUID(),

    /**
     * Zulässige Werte gemäß [AssignedRole] (Vertragsrollen zuzüglich
     * `tabletRecorder`); die Datenbank erzwingt sie über `ck_user_roles_role`.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "role", length = 32, nullable = false)
    var role: AssignedRole = AssignedRole.member
) : Serializable

@Entity
@Table(name = "user_roles")
class UserRoleEntity(
    @EmbeddedId
    var id: UserRoleId = UserRoleId(),

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("userId")
    @JoinColumn(name = "user_id")
    var user: UserEntity? = null
)

@Embeddable
data class UserPermissionId(
    @Column(name = "user_id", nullable = false)
    var userId: UUID = UUID.randomUUID(),

    @Column(name = "permission", length = 64, nullable = false)
    var permission: String = ""
) : Serializable

@Entity
@Table(name = "user_permissions")
class UserPermissionEntity(
    @EmbeddedId
    var id: UserPermissionId = UserPermissionId(),

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("userId")
    @JoinColumn(name = "user_id")
    var user: UserEntity? = null
)
