package de.maurer.baseservice.domain

import de.maurer.baseservice.security.UserRole
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

    /** Fassung der AGB, der das Konto zuletzt zugestimmt hat (siehe [de.maurer.baseservice.service.TermsConsent]). */
    @Column(name = "terms_version", length = 32)
    var termsVersion: String? = null,

    @Column(name = "terms_accepted_at")
    var termsAcceptedAt: Instant? = null,

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
     * Code einer Rolle des Stammtischs (`stammtisch_roles.code`), etwa `member`,
     * `board`, `admin`, `tabletRecorder` oder eine eigene Rolle.
     */
    @Column(name = "role", length = 64, nullable = false)
    var role: String = UserRole.MEMBER
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
) : StammtischScoped()

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
) : StammtischScoped()
