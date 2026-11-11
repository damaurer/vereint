package de.maurer.baseservice.domain

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * Ein Statistikeintrag: eine Person hat in einer Gruppe (und optional einem
 * Event) eine Funktion ausgelöst oder darauf geantwortet. Gespeichert werden
 * nur Zählwerte, keine Inhalte. Angelegt ausschließlich vom
 * [de.maurer.baseservice.service.StatisticsRecorder], der vorher die Schalter
 * von Nutzer, Gruppe und Event prüft.
 *
 * - [sourceId]: die Fachzeile, die den Eintrag ausgelöst hat (Buchung,
 *   Moment, Nachricht, Antwort …); damit lässt sich ein stornierter Kauf
 *   wieder entfernen.
 * - [respondsTo]: das Objekt, auf das geantwortet wurde (Event, Moment,
 *   Nachricht, Einladungslink).
 * - [variant]: kurzer Code zur Unterscheidung, etwa die Antwort
 *   (`accepted`, `maybe`, `declined`), die Herkunft eines Kaufs oder die Art
 *   des Chats; nie freier Text.
 */
@Entity
@Table(name = "statistic_records")
class StatisticRecordEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "event_id", updatable = false)
    var eventId: UUID? = null,

    @Column(name = "actor_user_id", updatable = false)
    var actorUserId: UUID? = null,

    @Column(name = "feature", length = 32, nullable = false, updatable = false)
    var feature: String = "",

    @Column(name = "kind", length = 16, nullable = false, updatable = false)
    var kind: String = StatisticKind.TRIGGERED,

    @Column(name = "variant", length = 32, updatable = false)
    var variant: String? = null,

    @Column(name = "responds_to", updatable = false)
    var respondsTo: UUID? = null,

    @Column(name = "source_id", updatable = false)
    var sourceId: UUID? = null,

    @Column(name = "quantity", nullable = false, updatable = false)
    var quantity: Int = 1,

    @Column(name = "occurred_at", nullable = false, updatable = false)
    var occurredAt: Instant = Instant.now()
) : StammtischScoped()

/** `kind` eines Statistikeintrags. */
object StatisticKind {
    const val TRIGGERED = "triggered"
    const val RESPONSE = "response"
}

/** `feature` eines Statistikeintrags. */
object StatisticFeature {
    const val PURCHASE = "purchase"
    const val TOP_UP = "top_up"
    const val ROUND = "round"
    const val EVENT = "event"
    const val RSVP = "rsvp"
    const val MOMENT = "moment"
    const val MOMENT_REACTION = "moment_reaction"
    const val MOMENT_MEDIA = "moment_media"
    const val CHAT_MESSAGE = "chat_message"
    const val CHAT_REACTION = "chat_reaction"
    const val INVITE_LINK = "invite_link"
    const val INVITE_JOIN = "invite_join"

    val ALL = listOf(
        PURCHASE, ROUND, TOP_UP, EVENT, RSVP, MOMENT, MOMENT_REACTION, MOMENT_MEDIA,
        CHAT_MESSAGE, CHAT_REACTION, INVITE_LINK, INVITE_JOIN
    )
}
