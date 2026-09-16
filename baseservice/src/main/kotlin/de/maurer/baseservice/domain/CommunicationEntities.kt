package de.maurer.baseservice.domain

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

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
)

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
    var joinedAt: Instant = Instant.now()
)

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

    @Column(name = "message", nullable = false)
    var message: String = "",

    @Column(name = "image_url", length = 512)
    var imageUrl: String? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now()
)

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

    @Column(name = "title", length = 255, nullable = false)
    var title: String = "",

    @Column(name = "body", nullable = false)
    var body: String = "",

    @Column(name = "type", length = 64, nullable = false)
    var type: String = "",

    @Column(name = "read", nullable = false)
    var read: Boolean = false,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
)

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
)

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

    @Column(name = "reaction", length = 64, nullable = false)
    var reaction: String = "",

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
)

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
)
