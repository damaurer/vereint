package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.time.Instant
import java.util.UUID

/**
 * Moment-Typ (z. B. „Gemeinsames Anstoßen“), vom Vorstand gepflegt.
 *
 * `code` steht in `moment_sessions.topic_type` und bleibt für immer gleich;
 * Name und Emoji dürfen sich ändern. Ein ausgemusterter Typ (`active = false`)
 * kann nicht mehr gestartet werden, bestehende Moments behalten ihn.
 */
@Entity
@Table(name = "moment_types")
@EntityListeners(AuditingEntityListener::class)
class MomentTypeEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "code", length = 64, nullable = false, updatable = false)
    var code: String = "",

    @Column(name = "name", length = 64, nullable = false)
    var name: String = "",

    @Column(name = "emoji", length = 16, nullable = false)
    var emoji: String = "",

    @Column(name = "description", length = 255)
    var description: String? = null,

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0,

    @Column(name = "active", nullable = false)
    var active: Boolean = true,

    /** `true`: alle aktiven Reaktionen sind erlaubt; sonst nur [reactions]. */
    @Column(name = "all_reactions", nullable = false)
    var allReactions: Boolean = true,

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "moment_type_reactions",
        joinColumns = [JoinColumn(name = "type_id")],
        inverseJoinColumns = [JoinColumn(name = "reaction_id")]
    )
    var reactions: MutableSet<MomentReactionEntity> = mutableSetOf(),

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

/**
 * Reaktion, die Mitglieder in einem Moment abgeben können (z. B. 🍻 Anstoßen).
 * `code` steht in `moment_responses.reaction`; ausgemusterte Reaktionen bleiben
 * an bestehenden Beiträgen sichtbar.
 */
@Entity
@Table(name = "moment_reactions")
@EntityListeners(AuditingEntityListener::class)
class MomentReactionEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "code", length = 64, nullable = false, updatable = false)
    var code: String = "",

    @Column(name = "name", length = 64, nullable = false)
    var name: String = "",

    @Column(name = "emoji", length = 16, nullable = false)
    var emoji: String = "",

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0,

    @Column(name = "active", nullable = false)
    var active: Boolean = true,

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

/** Art einer Moment-Datei. */
enum class MomentMediaKind { image, video }

/**
 * Bild oder kurzes Video in einem Moment. Die Datei liegt verschlüsselt im
 * Objektspeicher (Stromformat des DataEncryptor) und wird nur über den
 * berechtigungsgeprüften Content-Endpunkt ausgeliefert.
 *
 * Nach dem Hochladen gehört die Datei noch zu keinem Beitrag (`response` leer)
 * und ist nur für den Eigentümer verwendbar; erst das Absenden des Beitrags
 * macht sie sichtbar. Nicht verwendete Uploads räumt ein Job auf.
 */
@Entity
@Table(name = "moment_media")
@EntityListeners(AuditingEntityListener::class)
class MomentMediaEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "moment_id", nullable = false)
    var moment: MomentSessionEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "response_id")
    var response: MomentResponseEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    var owner: UserEntity? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", length = 16, nullable = false)
    var kind: MomentMediaKind = MomentMediaKind.image,

    @Column(name = "content_type", length = 64, nullable = false)
    var contentType: String = "",

    /** Größe der Klartextdatei in Byte. */
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
