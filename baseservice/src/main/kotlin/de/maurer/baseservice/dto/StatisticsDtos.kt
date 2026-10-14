package de.maurer.baseservice.dto

import java.math.BigDecimal

/**
 * Vereinsstatistik für alle Angemeldeten. Zählt Käufe (Striche), die nicht
 * storniert wurden; Beträge in Vereinswährung.
 */
data class ClubStatisticsDto(
    val periodDays: Int,
    val totalItems: Int,
    val myItems: Int,
    val myRank: Int?,
    val topConsumers: List<MemberCountDto>,
    val attendancePercent: Int?,
    val spending: SpendingDto,
    val itemRanking: List<ItemShareDto>,
    val topEvents: List<EventCountDto>
)

data class MemberCountDto(
    val memberId: String,
    val displayName: String,
    val count: Int
)

/** Umsatz der letzten 30 Tage, Veränderung zu den 30 Tagen davor und Wochenverlauf (älteste Woche zuerst). */
data class SpendingDto(
    val total: BigDecimal,
    val currency: String,
    val changePercent: Int?,
    val weekly: List<BigDecimal>
)

data class ItemShareDto(
    val name: String,
    val count: Int,
    val sharePercent: Int
)

data class EventCountDto(
    val eventId: String,
    val title: String,
    val count: Int
)
