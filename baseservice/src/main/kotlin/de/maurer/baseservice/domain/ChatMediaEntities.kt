package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.time.Instant
import java.util.UUID

/**
 * Foto oder kurzes Video in einem Gruppen-, Event- oder Moment-Chat. Die Datei
 * liegt wie bei Moments verschlüsselt im Objektspeicher und wird nur über den
 * berechtigungsgeprüften Content-Endpunkt ausgeliefert.
 *
 * Solange `messageId` leer ist, gehört der Upload zu keiner Nachricht und ist
 * nur für den Eigentümer verwendbar; ein Job räumt solche Uploads weg.
 */
@Entity
@Table(name = "chat_media")
@EntityListeners(AuditingEntityListener::class)
class ChatMediaEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "conversation_id", nullable = false, updatable = false)
    var conversationId: UUID = UUID.randomUUID(),

    @Column(name = "message_id")
    var messageId: UUID? = null,

    @Column(name = "owner_id", nullable = false, updatable = false)
    var ownerId: UUID = UUID.randomUUID(),

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", length = 16, nullable = false)
    var kind: MomentMediaKind = MomentMediaKind.image,

    @Column(name = "content_type", length = 64, nullable = false)
    var contentType: String = "",

    @Column(name = "size_bytes", nullable = false)
    var sizeBytes: Long = 0,

    @Column(name = "storage_key", length = 512, nullable = false, unique = true)
    var storageKey: String = "",

    @Column(name = "encrypted", nullable = false)
    var encrypted: Boolean = true,

    @Column(name = "width")
    var width: Int? = null,

    @Column(name = "height")
    var height: Int? = null,

    @Column(name = "duration_ms")
    var durationMs: Long? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped()

/** Foto oder Video in einer Direktnachricht (gruppenübergreifend, ohne Gruppe). */
@Entity
@Table(name = "direct_media")
@EntityListeners(AuditingEntityListener::class)
class DirectMediaEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "conversation_id", nullable = false, updatable = false)
    var conversationId: UUID = UUID.randomUUID(),

    @Column(name = "message_id")
    var messageId: UUID? = null,

    @Column(name = "owner_id", nullable = false, updatable = false)
    var ownerId: UUID = UUID.randomUUID(),

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", length = 16, nullable = false)
    var kind: MomentMediaKind = MomentMediaKind.image,

    @Column(name = "content_type", length = 64, nullable = false)
    var contentType: String = "",

    @Column(name = "size_bytes", nullable = false)
    var sizeBytes: Long = 0,

    @Column(name = "storage_key", length = 512, nullable = false, unique = true)
    var storageKey: String = "",

    @Column(name = "encrypted", nullable = false)
    var encrypted: Boolean = true,

    @Column(name = "width")
    var width: Int? = null,

    @Column(name = "height")
    var height: Int? = null,

    @Column(name = "duration_ms")
    var durationMs: Long? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
)
