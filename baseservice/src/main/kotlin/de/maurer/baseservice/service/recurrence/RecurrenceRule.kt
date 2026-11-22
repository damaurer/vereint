package de.maurer.baseservice.service.recurrence

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Wiederholungsrhythmus nach RFC 5545 (`FREQ`). */
enum class RecurrenceFrequency { DAILY, WEEKLY, MONTHLY, YEARLY }

/**
 * Ein Wochentag mit optionaler Position im Monat (`BYDAY`): `0` heißt jeder
 * dieser Wochentage, `1..5` der erste bis fünfte, `-1..-5` der letzte bis
 * fünftletzte. Beispiel: `-1SA` ist der letzte Samstag.
 */
data class WeekdayNum(val position: Int, val day: DayOfWeek) {
    fun toRRule(): String = (if (position == 0) "" else position.toString()) + DAY_CODES.getValue(day)

    companion object {
        val DAY_CODES: Map<DayOfWeek, String> = mapOf(
            DayOfWeek.MONDAY to "MO",
            DayOfWeek.TUESDAY to "TU",
            DayOfWeek.WEDNESDAY to "WE",
            DayOfWeek.THURSDAY to "TH",
            DayOfWeek.FRIDAY to "FR",
            DayOfWeek.SATURDAY to "SA",
            DayOfWeek.SUNDAY to "SU"
        )
        private val CODE_DAYS = DAY_CODES.entries.associate { (k, v) -> v to k }

        fun dayOf(code: String): DayOfWeek? = CODE_DAYS[code.trim().uppercase()]

        fun parse(value: String): WeekdayNum {
            val trimmed = value.trim().uppercase()
            require(trimmed.length >= 2) { "BYDAY: $value" }
            val day = dayOf(trimmed.takeLast(2)) ?: throw IllegalArgumentException("BYDAY: $value")
            val prefix = trimmed.dropLast(2).removePrefix("+")
            val position = if (prefix.isEmpty()) 0 else prefix.toInt()
            return WeekdayNum(position, day)
        }
    }
}

/**
 * Teilmenge einer RFC-5545-`RRULE`, die Vereint für wiederkehrende Events
 * nutzt: `FREQ`, `INTERVAL`, `BYDAY` (mit Position), `BYMONTHDAY` (auch
 * negativ, `-1` = letzter Tag), `BYMONTH`, `COUNT` und `UNTIL` (Datum, inklusive).
 *
 * Positionen in `BYDAY` gelten bei `MONTHLY` und `YEARLY` innerhalb des Monats
 * (bei `YEARLY` also immer zusammen mit `BYMONTH` bzw. dem Monat des Beginns).
 */
data class RecurrenceRule(
    val frequency: RecurrenceFrequency,
    val interval: Int = 1,
    val byDay: List<WeekdayNum> = emptyList(),
    val byMonthDay: List<Int> = emptyList(),
    val byMonth: List<Int> = emptyList(),
    val count: Int? = null,
    val until: LocalDate? = null
) {
    init {
        require(interval in 1..MAX_INTERVAL) { "INTERVAL" }
        require(byDay.all { it.position in -5..5 }) { "BYDAY" }
        require(byMonthDay.all { it != 0 && it in -31..31 }) { "BYMONTHDAY" }
        require(byMonth.all { it in 1..12 }) { "BYMONTH" }
        require(count == null || count in 1..MAX_COUNT) { "COUNT" }
    }

    fun toRRule(): String = buildList {
        add("FREQ=${frequency.name}")
        if (interval != 1) add("INTERVAL=$interval")
        if (byDay.isNotEmpty()) add("BYDAY=" + byDay.joinToString(",") { it.toRRule() })
        if (byMonthDay.isNotEmpty()) add("BYMONTHDAY=" + byMonthDay.joinToString(","))
        if (byMonth.isNotEmpty()) add("BYMONTH=" + byMonth.joinToString(","))
        if (count != null) add("COUNT=$count")
        if (until != null) add("UNTIL=" + until.format(DateTimeFormatter.BASIC_ISO_DATE))
    }.joinToString(";")

    companion object {
        const val MAX_INTERVAL = 99
        const val MAX_COUNT = 500

        /** Liest eine `RRULE` (mit oder ohne Präfix `RRULE:`); unbekannte Teile werden abgelehnt. */
        fun parse(value: String): RecurrenceRule {
            val parts = value.trim().removePrefix("RRULE:").split(';')
                .filter { it.isNotBlank() }
                .associate { part ->
                    val idx = part.indexOf('=')
                    require(idx > 0) { "RRULE: $part" }
                    part.substring(0, idx).trim().uppercase() to part.substring(idx + 1).trim()
                }
            val unknown = parts.keys - setOf("FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "BYMONTH", "COUNT", "UNTIL", "WKST")
            require(unknown.isEmpty()) { "RRULE: $unknown" }
            val frequency = RecurrenceFrequency.valueOf(parts["FREQ"] ?: throw IllegalArgumentException("FREQ"))
            fun ints(key: String) = parts[key]?.split(',')?.filter { it.isNotBlank() }?.map { it.trim().toInt() }.orEmpty()
            return RecurrenceRule(
                frequency = frequency,
                interval = parts["INTERVAL"]?.toInt() ?: 1,
                byDay = parts["BYDAY"]?.split(',')?.filter { it.isNotBlank() }?.map { WeekdayNum.parse(it) }.orEmpty(),
                byMonthDay = ints("BYMONTHDAY"),
                byMonth = ints("BYMONTH"),
                count = parts["COUNT"]?.toInt(),
                until = parts["UNTIL"]?.let { LocalDate.parse(it.take(8), DateTimeFormatter.BASIC_ISO_DATE) }
            )
        }
    }
}
