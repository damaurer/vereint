package de.maurer.baseservice.dto

import io.swagger.v3.oas.annotations.media.Schema
import java.math.BigDecimal
import java.time.Instant

/**
 * Statistik der Gruppe für alle Mitglieder (Spaß-Fakten, namentlich, siehe AGB
 * „Statistiken“). Zählt Käufe (Striche), die nicht storniert wurden.
 *
 * Gemeinsame Felder aller drei Antworten: `period` (`30`, `90` oder `year`),
 * Beginn des Zeitraums `from` und dessen Länge in Tagen `days` (mindestens 1).
 */
@Schema(description = "Einstieg: Striche der Gruppe, eigene Striche, Platz, Rangliste und Zusagequote")
data class ClubStatisticsDto(
    val period: String,
    val from: Instant,
    val days: Int,
    val totalItems: Int,
    val myItems: Int,
    val myRank: Int?,
    @Schema(description = "Zahl der Personen in der Rangliste („Platz 1 von 7“)")
    val rankedMembers: Int,
    val topConsumers: List<MemberCountDto>,
    val attendancePercent: Int?
)

data class MemberCountDto(
    val memberId: String,
    val displayName: String,
    val count: Int
)

/** Durchschnittliche Zahl der Getränke der Gruppe. */
data class DrinkAveragesDto(
    val perEvent: BigDecimal?,
    val perDay: BigDecimal,
    val perWeek: BigDecimal,
    val perMonth: BigDecimal
)

/** Anzahl je Kategoriegruppe (`beer`, `nonAlcoholic`, `spirits`, `wineSparkling`, `other`). */
data class CategoryCountDto(
    val category: String,
    val count: Int
)

/** Ein Getränk eines Mitglieds: Menge je Portion, Anzahl und Kalorien (ohne Angabe `null`). */
data class MemberDrinkLineDto(
    val name: String,
    val volumeMl: Int?,
    val count: Int,
    val kcal: Int?
)

data class MemberDrinkStatsDto(
    val rank: Int,
    val memberId: String,
    val displayName: String,
    val count: Int,
    val kcal: Int,
    val liters: BigDecimal,
    val perEvent: BigDecimal?,
    val perWeek: BigDecimal,
    val categories: List<CategoryCountDto>,
    val drinks: List<MemberDrinkLineDto>
)

data class DrinkTotalsDto(
    val rank: Int,
    val name: String,
    val category: String,
    val volumeMl: Int?,
    val count: Int,
    val liters: BigDecimal?,
    val kcal: Int?,
    val members: Int,
    val perEvent: BigDecimal?
)

@Schema(description = "Getränkestatistik: wer, was, wie viel, Liter und Kalorien")
data class DrinkStatisticsDto(
    val period: String,
    val from: Instant,
    val days: Int,
    val totalDrinks: Int,
    val liters: BigDecimal,
    val kcal: Int,
    @Schema(description = "Getränke ohne Füllmenge; sie zählen nicht bei den Litern")
    val withoutVolume: Int,
    @Schema(description = "Getränke ohne Kalorienangabe; sie zählen nicht bei den Kalorien")
    val withoutKcal: Int,
    val averages: DrinkAveragesDto,
    @Schema(description = "`member` oder `drink`")
    val by: String,
    val members: List<MemberDrinkStatsDto>,
    val drinks: List<DrinkTotalsDto>
)

data class OverviewKpisDto(
    val members: Int,
    val activeMembers: Int,
    val newMembers: Int,
    val events: Int,
    val avgParticipants: BigDecimal?,
    val attendancePercent: Int?,
    val drinks: Int,
    val drinksPerEvent: BigDecimal?,
    val liters: BigDecimal,
    val litersPerWeek: BigDecimal,
    val kcal: Int,
    val kcalPerMember: Int?,
    @Schema(description = "Nur mit Leserecht auf die Finanzen (Vorstand/Kasse), sonst `null`")
    val revenue: BigDecimal?,
    val revenuePerEvent: BigDecimal?,
    val currency: String,
    val drinksPerMonth: BigDecimal,
    val withoutVolume: Int,
    val withoutKcal: Int
)

data class EventRsvpDto(
    val eventId: String,
    val title: String,
    val startsAt: Instant,
    val accepted: Int,
    val maybe: Int,
    val declined: Int,
    val noAnswer: Int,
    val invited: Int
)

data class MemberRsvpDto(
    val memberId: String,
    val displayName: String,
    val accepted: Int,
    val maybe: Int,
    val declined: Int,
    @Schema(description = "Events mit mindestens einem Strich oder Kauf")
    val attended: Int,
    val invited: Int,
    val quotePercent: Int?
)

/** Anzahl je Abschnitt (Wochentag `1`–`7` ab Montag oder Uhrzeit wie `lt18`, `18` … `ge23`). */
data class BucketCountDto(
    val key: String,
    val count: Int
)

data class CategoryShareDto(
    val category: String,
    val count: Int,
    val sharePercent: Int,
    val liters: BigDecimal,
    val kcal: Int
)

data class TopDrinkDto(
    val name: String,
    val count: Int,
    val perEvent: BigDecimal?
)

data class MomentStatsDto(
    val started: Int,
    val reactions: Int,
    val media: Int
)

data class ChatStatsDto(
    val messages: Int,
    val mostActive: String?,
    val eventChats: Int
)

data class RecordDto(
    val label: String,
    val value: Int
)

data class RecordsDto(
    @Schema(description = "Event mit den meisten Getränken an einem Abend")
    val mostDrinksEvening: RecordDto?,
    @Schema(description = "Längste Serie aufeinanderfolgender Events mit Strich oder Kauf")
    val longestStreak: RecordDto?,
    @Schema(description = "Schnellste Zusage nach der Einladung, in Minuten")
    val fastestRsvp: RecordDto?
)

@Schema(description = "Statistik-Übersicht: alle Kennzahlen der Gruppe")
data class StatisticsOverviewDto(
    val period: String,
    val from: Instant,
    val days: Int,
    val kpis: OverviewKpisDto,
    val rsvpByEvent: List<EventRsvpDto>,
    val rsvpByMember: List<MemberRsvpDto>,
    @Schema(description = "Getränke je Woche, älteste Woche zuerst")
    val weekly: List<Int>,
    val weekdays: List<BucketCountDto>,
    val hours: List<BucketCountDto>,
    val whoDrinksWhat: List<MemberDrinkStatsDto>,
    val topDrinks: List<TopDrinkDto>,
    val categories: List<CategoryShareDto>,
    val roundGivers: List<MemberCountDto>,
    val moments: MomentStatsDto,
    val chat: ChatStatsDto,
    val records: RecordsDto
)
