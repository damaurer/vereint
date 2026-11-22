package de.maurer.baseservice.service.recurrence

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters

/**
 * Rechnet eine Serie in einzelne Termine (Kalendertage) um.
 *
 * Die Termine einer Serie sind die Tage der Regel ab dem Beginn (der Beginn
 * selbst zählt nur, wenn er zur Regel passt), dazu die zusätzlichen Termine,
 * ohne die ausgelassenen. Ohne Regel besteht die Serie aus dem Beginn und den
 * zusätzlichen Terminen (unregelmäßige Serie). `COUNT` zählt wie in RFC 5545
 * die Termine der Regel, bevor Ausnahmen abgezogen werden.
 *
 * Die Uhrzeit hängt nicht an der Regel: Jeder Termin beginnt zur selben
 * Ortszeit ([localStart]), auch über die Zeitumstellung hinweg.
 */
object RecurrenceExpander {

    /** Schutz gegen Regeln, die nie oder extrem selten treffen. */
    private const val MAX_PERIODS = 20_000

    fun dates(
        rule: RecurrenceRule?,
        start: LocalDate,
        extraDates: Collection<LocalDate> = emptyList(),
        excludedDates: Collection<LocalDate> = emptyList(),
        limit: LocalDate
    ): List<LocalDate> {
        val base = if (rule == null) listOf(start) else ruleDates(rule, start, limit)
        val excluded = excludedDates.toSet()
        return (base + extraDates)
            .asSequence()
            .filter { !it.isAfter(limit) && it !in excluded }
            .distinct()
            .sorted()
            .toList()
    }

    /** Termine nur aus der Regel, aufsteigend, ab [start] bis einschließlich [limit] bzw. `UNTIL`. */
    fun ruleDates(rule: RecurrenceRule, start: LocalDate, limit: LocalDate): List<LocalDate> {
        val end = listOfNotNull(limit, rule.until).min()
        val result = mutableListOf<LocalDate>()
        val count = rule.count
        var period = 0
        while (period < MAX_PERIODS) {
            val periodStart = periodStart(rule, start, period)
            if (periodStart.isAfter(end)) break
            for (date in candidates(rule, start, periodStart)) {
                if (date.isBefore(start)) continue
                // COUNT zählt auch Termine nach dem Limit, darum hier nur UNTIL/Limit prüfen.
                if (date.isAfter(end)) break
                result += date
                if (count != null && result.size >= count) return result
            }
            period++
        }
        return result
    }

    /** Startzeitpunkt eines Termins in der Zeitzone der Serie. */
    fun localStart(date: LocalDate, time: LocalTime, zone: ZoneId): ZonedDateTime =
        ZonedDateTime.ofLocal(LocalDateTime.of(date, time), zone, null)

    private fun periodStart(rule: RecurrenceRule, start: LocalDate, period: Int): LocalDate {
        val step = period.toLong() * rule.interval
        return when (rule.frequency) {
            RecurrenceFrequency.DAILY -> start.plusDays(step)
            RecurrenceFrequency.WEEKLY -> start.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).plusWeeks(step)
            RecurrenceFrequency.MONTHLY -> start.withDayOfMonth(1).plusMonths(step)
            RecurrenceFrequency.YEARLY -> start.withDayOfYear(1).plusYears(step)
        }
    }

    private fun candidates(rule: RecurrenceRule, start: LocalDate, periodStart: LocalDate): List<LocalDate> {
        val days = when (rule.frequency) {
            RecurrenceFrequency.DAILY -> listOf(periodStart).filter { date ->
                (rule.byDay.isEmpty() || rule.byDay.any { it.day == date.dayOfWeek }) &&
                    (rule.byMonthDay.isEmpty() || matchesMonthDay(date, rule.byMonthDay))
            }
            RecurrenceFrequency.WEEKLY -> {
                val weekdays = rule.byDay.map { it.day }.ifEmpty { listOf(start.dayOfWeek) }.toSet()
                (0L until 7L).map { periodStart.plusDays(it) }.filter { it.dayOfWeek in weekdays }
            }
            RecurrenceFrequency.MONTHLY -> monthDays(rule, start, YearMonth.from(periodStart))
            RecurrenceFrequency.YEARLY -> rule.byMonth.ifEmpty { listOf(start.monthValue) }
                .distinct()
                .sorted()
                .flatMap { month -> monthDays(rule, start, YearMonth.of(periodStart.year, month)) }
        }
        return days.filter { rule.byMonth.isEmpty() || it.monthValue in rule.byMonth }.distinct().sorted()
    }

    private fun matchesMonthDay(date: LocalDate, monthDays: List<Int>): Boolean {
        val length = date.lengthOfMonth()
        return monthDays.any { resolveMonthDay(it, length) == date.dayOfMonth }
    }

    private fun resolveMonthDay(value: Int, length: Int): Int? {
        val day = if (value < 0) length + 1 + value else value
        return day.takeIf { it in 1..length }
    }

    /** Tage eines Monats nach `BYMONTHDAY` bzw. `BYDAY`; ohne beides der Tag des Beginns (fehlt er, entfällt der Monat). */
    private fun monthDays(rule: RecurrenceRule, start: LocalDate, month: YearMonth): List<LocalDate> {
        val length = month.lengthOfMonth()
        if (rule.byMonthDay.isNotEmpty()) {
            val days = rule.byMonthDay.mapNotNull { resolveMonthDay(it, length) }.map { month.atDay(it) }
            return if (rule.byDay.isEmpty()) days else days.filter { d -> rule.byDay.any { it.day == d.dayOfWeek } }
        }
        if (rule.byDay.isNotEmpty()) {
            return rule.byDay.flatMap { weekday ->
                val all = (1..length).map { month.atDay(it) }.filter { it.dayOfWeek == weekday.day }
                when {
                    weekday.position == 0 -> all
                    weekday.position > 0 -> listOfNotNull(all.getOrNull(weekday.position - 1))
                    else -> listOfNotNull(all.getOrNull(all.size + weekday.position))
                }
            }
        }
        return listOfNotNull(start.dayOfMonth.takeIf { it <= length }?.let { month.atDay(it) })
    }

    /** Anzahl der Tage zwischen zwei Daten (für Verschiebungen des Serienbeginns). */
    fun daysBetween(from: LocalDate, to: LocalDate): Long = ChronoUnit.DAYS.between(from, to)
}
