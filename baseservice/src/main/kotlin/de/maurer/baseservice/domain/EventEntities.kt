package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

@Entity
@Table(name = "events")
@EntityListeners(AuditingEntityListener::class)
class EventEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "title", length = 255, nullable = false)
    var title: String = "",

    @Column(name = "description")
    var description: String? = null,

    @Column(name = "location", length = 255)
    var location: String? = null,

    @Column(name = "starts_at", nullable = false)
    var startsAt: Instant = Instant.now(),

    @Column(name = "ends_at")
    var endsAt: Instant? = null,

    /**
     * Zulässige Werte gemäß [EventStatus]; die Datenbank erzwingt sie über
     * `ck_events_status`.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 32, nullable = false)
    var status: EventStatus = EventStatus.draft,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    var owner: UserEntity? = null,

    /** Ab wann Eingeladene benachrichtigt werden; `null` heißt: sobald das Event veröffentlicht ist. */
    @Column(name = "invitation_notify_at")
    var invitationNotifyAt: Instant? = null,

    /** Optionale Erinnerung so viele Stunden vor Beginn an alle, die nicht abgesagt haben. */
    @Column(name = "reminder_hours_before")
    var reminderHoursBefore: Int? = null,

    /** „Statistik für dieses Event“: aus heißt, im Event wird nichts erfasst. */
    @Column(name = "statistics_enabled", nullable = false)
    var statisticsEnabled: Boolean = true,

    /** Serie, zu der dieser Termin gehört; `null` bei einem einzelnen Event. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "series_id")
    var series: EventSeriesEntity? = null,

    /** Ursprünglicher Tag des Termins in der Serie; bleibt beim Verschieben gleich. */
    @Column(name = "series_date")
    var seriesDate: LocalDate? = null,

    /** Einzeln bearbeitet: Änderungen an der ganzen Serie lassen diesen Termin in Ruhe. */
    @Column(name = "series_detached", nullable = false)
    var seriesDetached: Boolean = false,

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
@Table(
    name = "event_participants",
    uniqueConstraints = [UniqueConstraint(name = "uk_event_participants_event_user", columnNames = ["event_id", "user_id"])]
)
@EntityListeners(AuditingEntityListener::class)
class EventParticipantEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id", nullable = false)
    var event: EventEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: UserEntity? = null,

    @Column(name = "role", length = 32, nullable = false)
    var role: String = "participant",

    @Enumerated(EnumType.STRING)
    @Column(name = "rsvp", length = 16, nullable = false)
    var rsvp: RsvpStatus = RsvpStatus.invited,

    @Column(name = "rsvp_at")
    var rsvpAt: Instant? = null,

    @Column(name = "invitation_sent_at")
    var invitationSentAt: Instant? = null,

    @Column(name = "reminder_sent_at")
    var reminderSentAt: Instant? = null,

    @CreatedDate
    @Column(name = "joined_at", nullable = false, updatable = false)
    var joinedAt: Instant = Instant.now()
) : StammtischScoped()

@Entity
@Table(name = "event_invites")
@EntityListeners(AuditingEntityListener::class)
class EventInviteEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id", nullable = false)
    var event: EventEntity? = null,

    @Column(name = "token_hash", length = 64, nullable = false, unique = true)
    var tokenHash: String = "",

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    var createdBy: UserEntity? = null,

    @Column(name = "role", length = 32, nullable = false)
    var role: String = "guest",

    @Column(name = "max_uses")
    var maxUses: Int? = null,

    @Column(name = "uses_count", nullable = false)
    var usesCount: Int = 0,

    @Column(name = "expires_at")
    var expiresAt: Instant? = null,

    @Column(name = "revoked", nullable = false)
    var revoked: Boolean = false,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped()

@Entity
@Table(name = "event_guests")
@EntityListeners(AuditingEntityListener::class)
class EventGuestEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id", nullable = false)
    var event: EventEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invite_id")
    var invite: EventInviteEntity? = null,

    @Column(name = "guest_token_hash", length = 64, nullable = false, unique = true)
    var guestTokenHash: String = "",

    @Column(name = "display_name", length = 255, nullable = false)
    var displayName: String = "",

    /**
     * Zulässige Werte gemäß [GuestStatus]; die Datenbank erzwingt sie über
     * `ck_event_guests_status`.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 32, nullable = false)
    var status: GuestStatus = GuestStatus.active,

    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.now(),

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
) : StammtischScoped()

/**
 * Wiederkehrendes Event: Rhythmus nach RFC 5545 ([rrule], leer = nur eigene
 * Termine) samt Vorlage für jeden Termin. Die Termine selbst sind normale
 * [EventEntity]s mit Verweis auf die Serie.
 */
@Entity
@Table(name = "event_series")
@EntityListeners(AuditingEntityListener::class)
class EventSeriesEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    var owner: UserEntity? = null,

    @Column(name = "title", length = 255, nullable = false)
    var title: String = "",

    @Column(name = "description")
    var description: String? = null,

    @Column(name = "location", length = 255)
    var location: String? = null,

    /** Beginn der Serie (Anker für Intervalle wie „alle 2 Wochen“). */
    @Column(name = "starts_on", nullable = false)
    var startsOn: LocalDate = LocalDate.now(),

    /** Ortszeit des Beginns jedes Termins in [timeZone]. */
    @Column(name = "start_time", nullable = false)
    var startTime: LocalTime = LocalTime.of(19, 0),

    @Column(name = "duration_minutes")
    var durationMinutes: Int? = null,

    @Column(name = "time_zone", length = 64, nullable = false)
    var timeZone: String = "Europe/Berlin",

    @Column(name = "rrule", length = 500)
    var rrule: String? = null,

    /** Zusätzliche Termine, ISO-Daten durch Komma getrennt. */
    @Column(name = "extra_dates")
    var extraDates: String? = null,

    /** Ausgelassene Termine, ISO-Daten durch Komma getrennt. */
    @Column(name = "excluded_dates")
    var excludedDates: String? = null,

    /** Status neuer Termine: `draft` oder `published`. */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16, nullable = false)
    var status: EventStatus = EventStatus.published,

    /** Einladung so viele Tage vor jedem Termin; `null` = sofort. */
    @Column(name = "invite_lead_days")
    var inviteLeadDays: Int? = null,

    @Column(name = "reminder_hours_before")
    var reminderHoursBefore: Int? = null,

    @Column(name = "statistics_enabled", nullable = false)
    var statisticsEnabled: Boolean = true,

    @Column(name = "invite_all_members", nullable = false)
    var inviteAllMembers: Boolean = false,

    /**
     * Erste Serie, aus der diese durch Teilen entstand; ihr Chat gilt weiter.
     * `null` = diese Serie ist selbst der Anfang.
     */
    @Column(name = "chat_root_id")
    var chatRootId: UUID? = null,

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

/** Wer zu jedem neuen Termin einer Serie eingeladen wird. */
@Entity
@Table(
    name = "event_series_invitees",
    uniqueConstraints = [UniqueConstraint(name = "uk_event_series_invitees_series_user", columnNames = ["series_id", "user_id"])]
)
@EntityListeners(AuditingEntityListener::class)
class EventSeriesInviteeEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "series_id", nullable = false)
    var series: EventSeriesEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: UserEntity? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now()
) : StammtischScoped()
