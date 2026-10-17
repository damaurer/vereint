package de.maurer.baseservice.dto

import jakarta.validation.constraints.NotBlank
import java.time.Instant

/** Gemeinsame Gruppe zweier Personen (nur Gruppen, in denen man selbst ist). */
data class SharedGroupDto(
    val id: String,
    val name: String
)

/**
 * Eine Person in der Freundesliste oder in den Kontakten.
 *
 * `friendStatus`: `friend`, `incoming` (Anfrage an mich), `outgoing` (meine
 * Anfrage) oder `none`. `sharedGroups` nennt die gemeinsamen Gruppen; leer,
 * wenn man keine Gruppe mehr teilt.
 */
data class FriendContactDto(
    val userId: String,
    val displayName: String,
    val friendStatus: String,
    val since: Instant?,
    val sharedGroups: List<SharedGroupDto>,
    val canMessage: Boolean
)

/** Freundesliste mit offenen Anfragen in beide Richtungen. */
data class FriendsOverviewDto(
    val friends: List<FriendContactDto>,
    val incoming: List<FriendContactDto>,
    val outgoing: List<FriendContactDto>
)

data class FriendRequestRequest(
    @field:NotBlank(message = "userId {validation.notBlank}")
    val userId: String? = null
)

/**
 * Eintrag im persönlichen Kalender: ein Event (`kind = event`) oder ein Moment
 * (`kind = moment`). Jeder Eintrag nennt die Gruppe, zu der er gehört.
 */
data class CalendarEntryDto(
    val kind: String,
    val id: String,
    val eventId: String,
    val title: String,
    val startsAt: Instant,
    val endsAt: Instant?,
    val location: String?,
    /** Status des Events (`published`, `cancelled`, ...); beim Moment der Status seines Events. */
    val status: String,
    val myRsvp: String?,
    val emoji: String?,
    val topicName: String?,
    val active: Boolean,
    val stammtischId: String,
    val stammtischName: String
)

data class CalendarDto(
    val from: Instant,
    val to: Instant,
    val entries: List<CalendarEntryDto>
)
