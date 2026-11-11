package de.maurer.baseservice.dto

import io.swagger.v3.oas.annotations.media.Schema
import java.math.BigDecimal
import java.time.Instant

/**
 * Antworten der Statistik-Ebenen (Issue #104): eigene Statistik,
 * übergreifende Event-Statistik, Gruppen-Event-Statistik, Event-Statistik und
 * Funktions-Statistik. Alle Zahlen stammen aus `statistic_records` und sind
 * Summen; Rohdaten gehen nicht an den Client.
 */
@Schema(description = "Stand der Schalter: Nutzer, Gruppe und (auf der Event-Seite) Event")
data class StatisticsRecordingDto(
    val userEnabled: Boolean,
    @Schema(description = "`null` auf gruppenübergreifenden Seiten")
    val groupEnabled: Boolean? = null,
    @Schema(description = "Nur auf der Event-Statistik gesetzt")
    val eventEnabled: Boolean? = null
)

@Schema(description = "Anzahl je Funktion (`purchase`, `rsvp`, `moment`, …)")
data class FeatureCountDto(
    val feature: String,
    val count: Int
)

data class MyGroupStatisticsDto(
    val stammtischId: String,
    val stammtischName: String,
    val groupEnabled: Boolean,
    val total: Int,
    val counts: List<FeatureCountDto>
)

@Schema(description = "Eigene Statistik über alle eigenen Gruppen und Events")
data class MyStatisticsDto(
    val period: String,
    val from: Instant,
    val days: Int,
    val recording: StatisticsRecordingDto,
    val total: Int,
    val counts: List<FeatureCountDto>,
    @Schema(description = "Zusagen (letzte eigene Antwort je Event)")
    val accepted: Int,
    @Schema(description = "Events mit mindestens einem eigenen Strich oder Kauf")
    val attended: Int,
    val groups: List<MyGroupStatisticsDto>
)

@Schema(description = "Ein Event im Vergleich. Gruppenübergreifend ohne Namen anderer Personen.")
data class EventComparisonDto(
    val eventId: String,
    val title: String,
    val startsAt: Instant,
    val status: String,
    val statisticsEnabled: Boolean,
    @Schema(description = "Nur gruppenübergreifend gesetzt")
    val stammtischId: String? = null,
    val stammtischName: String? = null,
    val accepted: Int,
    val maybe: Int,
    val declined: Int,
    val noAnswer: Int,
    val invited: Int,
    @Schema(description = "Personen mit mindestens einem Strich oder Kauf")
    val attendees: Int,
    val purchases: Int,
    val rounds: Int,
    val moments: Int,
    val reactions: Int,
    val chatMessages: Int,
    @Schema(description = "Eigene Striche/Käufe (nur gruppenübergreifend)")
    val myPurchases: Int? = null,
    @Schema(description = "Eigene letzte Antwort (nur gruppenübergreifend)")
    val myRsvp: String? = null
)

data class EventTotalsDto(
    val events: Int,
    val attendances: Int,
    val avgAttendees: BigDecimal?,
    val attendancePercent: Int?,
    val purchases: Int,
    val purchasesPerEvent: BigDecimal?,
    val moments: Int
)

@Schema(description = "Alle sichtbaren Events aus allen eigenen Gruppen; Summen, Durchschnitte und eigene Werte")
data class CrossEventStatisticsDto(
    val period: String,
    val from: Instant,
    val days: Int,
    val recording: StatisticsRecordingDto,
    val totals: EventTotalsDto,
    val myAttended: Int,
    val myPurchases: Int,
    val events: List<EventComparisonDto>
)

@Schema(description = "Events der gewählten Gruppe zusammengefasst und im Vergleich")
data class GroupEventStatisticsDto(
    val period: String,
    val from: Instant,
    val days: Int,
    val recording: StatisticsRecordingDto,
    val totals: EventTotalsDto,
    val events: List<EventComparisonDto>
)

@Schema(description = "Alles innerhalb eines Events")
data class EventStatisticsDto(
    val eventId: String,
    val title: String,
    val startsAt: Instant,
    val recording: StatisticsRecordingDto,
    val accepted: Int,
    val maybe: Int,
    val declined: Int,
    val noAnswer: Int,
    val invited: Int,
    val attendees: Int,
    val purchases: Int,
    val rounds: Int,
    val moments: Int,
    val reactions: Int,
    val media: Int,
    val chatMessages: Int,
    val chatReactions: Int,
    @Schema(description = "Striche/Käufe je Person im Event, namentlich (innerhalb der Gruppe)")
    val topConsumers: List<MemberCountDto>
)

@Schema(description = "Eine Funktion: wie oft ausgelöst und wie darauf geantwortet wurde")
data class FeatureStatDto(
    @Schema(description = "`event`, `moment`, `chat_message`, `invite_link`, `round`, `purchase` oder `top_up`")
    val feature: String,
    val triggered: Int,
    @Schema(description = "Funktion der Antworten, etwa `rsvp` zu `event`; ohne Antworten `null`")
    val responseFeature: String?,
    val responses: Int,
    @Schema(description = "Aufschlüsselung, etwa Antworten nach `accepted`/`maybe`/`declined` oder Käufe nach Herkunft")
    val breakdown: List<BucketCountDto>
)

@Schema(description = "Funktions-Statistik der Gruppe")
data class FeatureStatisticsDto(
    val period: String,
    val from: Instant,
    val days: Int,
    val recording: StatisticsRecordingDto,
    val features: List<FeatureStatDto>
)

data class StatisticsSettingsDto(
    val enabled: Boolean
)

data class UpdateStatisticsSettingsRequest(
    val enabled: Boolean? = null
)

data class StatisticsDeletedDto(
    val deleted: Int
)
