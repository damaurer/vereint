package de.maurer.baseservice.domain

import de.maurer.baseservice.crypto.EncryptedStringConverter
import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "conversations")
@EntityListeners(AuditingEntityListener::class)
class ConversationEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "type", length = 32, nullable = false)
    var type: String = "event",

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id")
    var event: EventEntity? = null,

    @Column(name = "title", length = 255)
    var title: String? = null,

    @Column(name = "expires_at")
    var expiresAt: Instant? = null,

    /**
     * Eindeutiger Schlüssel: sortierte Nutzer-IDs eines Direktchats, `club`
     * für den Vereinschat bzw. `event:{id}` für den Chat eines Events.
     * Garantiert jeweils genau einen Chat.
     */
    @Column(name = "direct_key", length = 80)
    var directKey: String? = null,

    /** Angepinnte Infotafel des Vereinschats (verschlüsselt gespeichert). */
    @Convert(converter = EncryptedStringConverter::class)
    @Column(name = "pinned_text")
    var pinnedText: String? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pinned_by")
    var pinnedBy: UserEntity? = null,

    @Column(name = "pinned_at")
    var pinnedAt: Instant? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped()

@Entity
@Table(name = "conversation_members")
@EntityListeners(AuditingEntityListener::class)
class ConversationMemberEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "conversation_id", nullable = false)
    var conversation: ConversationEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    var user: UserEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "guest_id")
    var guest: EventGuestEntity? = null,

    @CreatedDate
    @Column(name = "joined_at", nullable = false, updatable = false)
    var joinedAt: Instant = Instant.now(),

    /** Zeitpunkt der zuletzt gelesenen Nachricht; Grundlage für ungelesene Zähler. */
    @Column(name = "last_read_at")
    var lastReadAt: Instant? = null
) : StammtischScoped()

@Entity
@Table(name = "chat_messages")
@EntityListeners(AuditingEntityListener::class)
class ChatMessageEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "conversation_id", nullable = false)
    var conversation: ConversationEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id")
    var sender: UserEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "guest_id")
    var guest: EventGuestEntity? = null,

    @Convert(converter = EncryptedStringConverter::class)
    @Column(name = "message", nullable = false)
    var message: String = "",

    @Column(name = "image_url", length = 512)
    var imageUrl: String? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now()
) : StammtischScoped()

@Entity
@Table(name = "chat_reactions")
class ChatReactionEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "message_id", nullable = false)
    var message: ChatMessageEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: UserEntity? = null,

    @Column(name = "emoji", length = 16, nullable = false)
    var emoji: String = "",

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now()
) : StammtischScoped()

@Entity
@Table(name = "notifications")
@EntityListeners(AuditingEntityListener::class)
class NotificationEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: UserEntity? = null,

    @Convert(converter = EncryptedStringConverter::class)
    @Column(name = "title", nullable = false)
    var title: String = "",

    @Convert(converter = EncryptedStringConverter::class)
    @Column(name = "body", nullable = false)
    var body: String = "",

    @Column(name = "type", length = 64, nullable = false)
    var type: String = "",

    @Column(name = "read", nullable = false)
    var read: Boolean = false,

    /** Optionales Ziel in der App, z. B. `/events/{id}` für Einladungen. */
    @Column(name = "link", length = 512)
    var link: String? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped()

@Entity
@Table(name = "push_subscriptions")
@EntityListeners(AuditingEntityListener::class)
class PushSubscriptionEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: UserEntity? = null,

    @Column(name = "endpoint", nullable = false)
    var endpoint: String = "",

    @Column(name = "p256dh", length = 255, nullable = false)
    var p256dh: String = "",

    @Column(name = "auth", length = 255, nullable = false)
    var auth: String = "",

    @Column(name = "user_agent", length = 512)
    var userAgent: String? = null,

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

@Entity
@Table(name = "moment_sessions")
@EntityListeners(AuditingEntityListener::class)
class MomentSessionEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id", nullable = false)
    var event: EventEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "creator_user_id", nullable = false)
    var creator: UserEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "conversation_id")
    var conversation: ConversationEntity? = null,

    @Column(name = "title", length = 255, nullable = false)
    var title: String = "",

    @Column(name = "topic_type", length = 64, nullable = false)
    var topicType: String = "",

    @Column(name = "message", length = 500)
    var message: String? = null,

    @Column(name = "latitude")
    var latitude: Double? = null,

    @Column(name = "longitude")
    var longitude: Double? = null,

    @Column(name = "active", nullable = false)
    var active: Boolean = true,

    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.now(),

    @Column(name = "completed_at")
    var completedAt: Instant? = null,

    @Column(name = "summary")
    var summary: String? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped()

@Entity
@Table(name = "moment_responses")
@EntityListeners(AuditingEntityListener::class)
class MomentResponseEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "moment_id", nullable = false)
    var moment: MomentSessionEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: UserEntity? = null,

    /** Code einer Moment-Reaktion; leer bei reinen Text-/Bild-/Videobeiträgen. */
    @Column(name = "reaction", length = 64)
    var reaction: String? = null,

    @Column(name = "status_text", length = 255)
    var statusText: String? = null,

    @Column(name = "latitude")
    var latitude: Double? = null,

    @Column(name = "longitude")
    var longitude: Double? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped()

/**
 * Append-only Audit-Protokoll für sicherheitsrelevante Änderungen
 * (Rollen, Permissions, Status).
 */
@Entity
@Table(name = "audit_logs")
@EntityListeners(AuditingEntityListener::class)
class AuditLogEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    var actor: UserEntity? = null,

    @Column(name = "action", length = 128, nullable = false)
    var action: String = "",

    @Column(name = "target_entity", length = 64, nullable = false)
    var targetEntity: String = "",

    @Column(name = "target_id", length = 128)
    var targetId: String? = null,

    @Column(name = "details")
    var details: String? = null,

    @Column(name = "ip_address", length = 64)
    var ipAddress: String? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now()
) : StammtischScoped()
