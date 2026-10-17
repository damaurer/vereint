package de.maurer.baseservice.domain

import de.maurer.baseservice.crypto.EncryptedStringConverter
import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.time.Instant
import java.util.UUID

/*
 * Gruppenübergreifende, persönliche Daten: Freundesliste und Direktnachrichten.
 *
 * Sie gehören wie `users` den Konten und keiner Gruppe, erben deshalb bewusst
 * nicht von [StammtischScoped] und haben keine Row-Level-Security. Die
 * Fachservices geben jede Zeile ausschließlich an die beiden beteiligten
 * Personen heraus (siehe `docs/domains/kalender-freunde-direktnachrichten.md`).
 */

enum class FriendshipStatus { pending, accepted }

@Entity
@Table(name = "friendships")
@EntityListeners(AuditingEntityListener::class)
class FriendshipEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    /** Sortierte Konto-IDs beider Personen; garantiert eine Zeile je Paar. */
    @Column(name = "pair_key", length = 80, nullable = false, updatable = false)
    var pairKey: String = "",

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requester_id", nullable = false, updatable = false)
    var requester: UserEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "addressee_id", nullable = false, updatable = false)
    var addressee: UserEntity? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16, nullable = false)
    var status: FriendshipStatus = FriendshipStatus.pending,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "accepted_at")
    var acceptedAt: Instant? = null,

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) {
    /** Die jeweils andere Person dieser Freundschaft aus Sicht von [userId]. */
    fun other(userId: UUID): UserEntity? = if (requester?.id == userId) addressee else requester
}

@Entity
@Table(name = "direct_conversations")
@EntityListeners(AuditingEntityListener::class)
class DirectConversationEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    /** Sortierte Konto-IDs beider Personen; genau ein Gespräch je Paar. */
    @Column(name = "pair_key", length = 80, nullable = false, updatable = false)
    var pairKey: String = "",

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
)

@Entity
@Table(name = "direct_participants")
class DirectParticipantEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "conversation_id", nullable = false, updatable = false)
    var conversation: DirectConversationEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, updatable = false)
    var user: UserEntity? = null,

    @Column(name = "joined_at", nullable = false, updatable = false)
    var joinedAt: Instant = Instant.now(),

    /** Zeitpunkt der zuletzt gelesenen Nachricht; Grundlage für ungelesene Zähler. */
    @Column(name = "last_read_at")
    var lastReadAt: Instant? = null
)

@Entity
@Table(name = "direct_messages")
@EntityListeners(AuditingEntityListener::class)
class DirectMessageEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "conversation_id", nullable = false, updatable = false)
    var conversation: DirectConversationEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id")
    var sender: UserEntity? = null,

    @Convert(converter = EncryptedStringConverter::class)
    @Column(name = "message", nullable = false)
    var message: String = "",

    @Column(name = "image_url", length = 512)
    var imageUrl: String? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now()
)

@Entity
@Table(name = "direct_reactions")
class DirectReactionEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "message_id", nullable = false)
    var message: DirectMessageEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: UserEntity? = null,

    @Column(name = "emoji", length = 16, nullable = false)
    var emoji: String = "",

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now()
)
