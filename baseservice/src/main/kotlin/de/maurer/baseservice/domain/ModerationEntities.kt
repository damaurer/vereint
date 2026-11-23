package de.maurer.baseservice.domain

import de.maurer.baseservice.crypto.EncryptedStringConverter
import jakarta.persistence.*
import java.time.Instant
import java.util.UUID

/*
 * Melden und Blockieren (#153).
 *
 * - `user_blocks` ist persönlich und gilt über alle Gruppen (wie
 *   `friendships`): kein [StammtischScoped], keine Row Level Security.
 * - `content_reports` gehört der Gruppe des gemeldeten Inhalts
 *   ([StammtischScoped], RLS-Policy `stammtisch_isolation`).
 * - `direct_reports` betrifft Direktnachrichten, die keiner Gruppe gehören;
 *   sie bearbeitet die Anwendungs-Administration.
 */

/** Was gemeldet wurde. */
enum class ReportTargetType { chat_message, moment, moment_response, direct_message }

enum class ReportReason { spam, harassment, inappropriate, other }

enum class ReportStatus { open, resolved }

/** Ausgang einer Meldung: Inhalt entfernt oder ohne Folgen geschlossen. */
enum class ReportResolution { removed, dismissed }

@Entity
@Table(name = "user_blocks")
class UserBlockEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "blocker_id", nullable = false, updatable = false)
    var blocker: UserEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "blocked_id", nullable = false, updatable = false)
    var blocked: UserEntity? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now()
)

@Entity
@Table(name = "content_reports")
class ContentReportEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reporter_id", nullable = false, updatable = false)
    var reporter: UserEntity? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", length = 32, nullable = false, updatable = false)
    var targetType: ReportTargetType = ReportTargetType.chat_message,

    @Column(name = "target_id", nullable = false, updatable = false)
    var targetId: UUID = UUID.randomUUID(),

    /** Wer den Inhalt verfasst hat. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_user_id", updatable = false)
    var targetUser: UserEntity? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "reason", length = 32, nullable = false, updatable = false)
    var reason: ReportReason = ReportReason.other,

    @Convert(converter = EncryptedStringConverter::class)
    @Column(name = "note", updatable = false)
    var note: String? = null,

    /** Auszug des Inhalts zum Zeitpunkt der Meldung; bleibt, auch wenn der Inhalt verschwindet. */
    @Convert(converter = EncryptedStringConverter::class)
    @Column(name = "excerpt", updatable = false)
    var excerpt: String? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16, nullable = false)
    var status: ReportStatus = ReportStatus.open,

    @Enumerated(EnumType.STRING)
    @Column(name = "resolution", length = 32)
    var resolution: ReportResolution? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by")
    var resolvedBy: UserEntity? = null,

    @Column(name = "resolved_at")
    var resolvedAt: Instant? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped()

@Entity
@Table(name = "direct_reports")
class DirectReportEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reporter_id", nullable = false, updatable = false)
    var reporter: UserEntity? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", length = 32, nullable = false, updatable = false)
    var targetType: ReportTargetType = ReportTargetType.chat_message,

    @Column(name = "target_id", nullable = false, updatable = false)
    var targetId: UUID = UUID.randomUUID(),

    /** Wer den Inhalt verfasst hat. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_user_id", updatable = false)
    var targetUser: UserEntity? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "reason", length = 32, nullable = false, updatable = false)
    var reason: ReportReason = ReportReason.other,

    @Convert(converter = EncryptedStringConverter::class)
    @Column(name = "note", updatable = false)
    var note: String? = null,

    /** Auszug des Inhalts zum Zeitpunkt der Meldung; bleibt, auch wenn der Inhalt verschwindet. */
    @Convert(converter = EncryptedStringConverter::class)
    @Column(name = "excerpt", updatable = false)
    var excerpt: String? = null,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16, nullable = false)
    var status: ReportStatus = ReportStatus.open,

    @Enumerated(EnumType.STRING)
    @Column(name = "resolution", length = 32)
    var resolution: ReportResolution? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resolved_by")
    var resolvedBy: UserEntity? = null,

    @Column(name = "resolved_at")
    var resolvedAt: Instant? = null,

    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
)
