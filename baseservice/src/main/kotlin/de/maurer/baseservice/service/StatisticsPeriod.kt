package de.maurer.baseservice.service

import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/**
 * Zeitraum der Statistik: die letzten 30 oder 90 Tage oder das laufende
 * Kalenderjahr (ab 1. Januar, Zeitzone der Gruppe).
 */
enum class StatisticsPeriod(val code: String) {
    DAYS_30("30"),
    DAYS_90("90"),
    YEAR("year");

    /** Beginn des Zeitraums. */
    fun start(now: Instant, zone: ZoneId = ZONE): Instant = when (this) {
        DAYS_30 -> now.minus(Duration.ofDays(30))
        DAYS_90 -> now.minus(Duration.ofDays(90))
        YEAR -> now.atZone(zone).toLocalDate().withDayOfYear(1).atStartOfDay(zone).toInstant()
    }

    companion object {
        /** Zeitzone für Kalenderjahr, Wochentag und Uhrzeit. */
        val ZONE: ZoneId = ZoneId.of("Europe/Berlin")

        /** `30`, `90` (Standard) oder `year`; alles andere `400 invalid_request`. */
        fun parse(value: String?): StatisticsPeriod = when (value?.trim()?.lowercase()) {
            null, "", "90" -> DAYS_90
            "30" -> DAYS_30
            "year", "jahr" -> YEAR
            else -> throw InvalidRequestException(Msg("error.statistics.invalidPeriod", value), ErrorCode.INVALID_REQUEST)
        }
    }
}
