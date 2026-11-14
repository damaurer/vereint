package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.time.Instant
import java.util.UUID

/**
 * Einladungslink zur Registrierung als Mitglied. Gespeichert wird nur der
 * SHA-256-Hash des Tokens; die Datenbank erzwingt `uses_count <= max_uses`
 * über `ck_member_invites_uses`.
 */
@Entity
@Table(name = "member_invites")
@EntityListeners(AuditingEntityListener::class)
class MemberInviteEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "token_hash", length = 64, nullable = false, unique = true)
    var tokenHash: String = "",

    /** Freitext zum Wiedererkennen, etwa der Name der eingeladenen Person. */
    @Column(name = "label", length = 120)
    var label: String? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    var createdBy: UserEntity? = null,

    @Column(name = "max_uses", nullable = false)
    var maxUses: Int = 1,

    @Column(name = "uses_count", nullable = false)
    var usesCount: Int = 0,

    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.now(),

    @Column(name = "revoked_at")
    var revokedAt: Instant? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "revoked_by")
    var revokedBy: UserEntity? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped() {
    val revoked: Boolean get() = revokedAt != null

    fun isExpired(now: Instant): Boolean = !expiresAt.isAfter(now)

    val exhausted: Boolean get() = usesCount >= maxUses
}

@Entity
@Table(name = "member_invite_redemptions")
class MemberInviteRedemptionEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invite_id", nullable = false)
    var invite: MemberInviteEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: UserEntity? = null,

    @Column(name = "redeemed_at", nullable = false)
    var redeemedAt: Instant = Instant.now()
) : StammtischScoped()
