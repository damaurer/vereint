package de.maurer.baseservice

import de.maurer.baseservice.service.recurrence.RecurrenceExpander
import de.maurer.baseservice.service.recurrence.RecurrenceFrequency
import de.maurer.baseservice.service.recurrence.RecurrenceRule
import de.maurer.baseservice.service.recurrence.WeekdayNum
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.DayOfWeek.FRIDAY
import java.time.DayOfWeek.MONDAY
import java.time.DayOfWeek.SATURDAY
import java.time.DayOfWeek.THURSDAY
import java.time.DayOfWeek.TUESDAY
import java.time.DayOfWeek.WEDNESDAY
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** Terminberechnung wiederkehrender Events (RFC-5545-Teilmenge). */
class RecurrenceExpanderTest {

    private val limit = LocalDate.of(2028, 12, 31)
    private fun d(value: String) = LocalDate.parse(value)

    @Test
    fun `woechentlich am Wochentag des Beginns`() {
        val rule = RecurrenceRule(RecurrenceFrequency.WEEKLY, count = 4)
        val dates = RecurrenceExpander.dates(rule, d("2026-11-24"), limit = limit)
        assertEquals(listOf(d("2026-11-24"), d("2026-12-01"), d("2026-12-08"), d("2026-12-15")), dates)
    }

    @Test
    fun `alle zwei Wochen dienstags und donnerstags`() {
        val rule = RecurrenceRule(
            RecurrenceFrequency.WEEKLY,
            interval = 2,
            byDay = listOf(WeekdayNum(0, TUESDAY), WeekdayNum(0, THURSDAY)),
            count = 5
        )
        // Beginn an einem Mittwoch: der Dienstag davor zählt nicht, der Donnerstag schon.
        val dates = RecurrenceExpander.dates(rule, d("2026-11-25"), limit = limit)
        assertEquals(listOf(d("2026-11-26"), d("2026-12-08"), d("2026-12-10"), d("2026-12-22"), d("2026-12-24")), dates)
    }

    @Test
    fun `letzter Samstag im Monat`() {
        val rule = RecurrenceRule(RecurrenceFrequency.MONTHLY, byDay = listOf(WeekdayNum(-1, SATURDAY)), count = 4)
        val dates = RecurrenceExpander.dates(rule, d("2026-11-01"), limit = limit)
        assertEquals(listOf(d("2026-11-28"), d("2026-12-26"), d("2027-01-30"), d("2027-02-27")), dates)
    }

    @Test
    fun `erster und dritter Mittwoch`() {
        val rule = RecurrenceRule(
            RecurrenceFrequency.MONTHLY,
            byDay = listOf(WeekdayNum(1, WEDNESDAY), WeekdayNum(3, WEDNESDAY)),
            until = d("2027-01-31")
        )
        val dates = RecurrenceExpander.dates(rule, d("2026-12-01"), limit = limit)
        assertEquals(listOf(d("2026-12-02"), d("2026-12-16"), d("2027-01-06"), d("2027-01-20")), dates)
    }

    @Test
    fun `monatlich am 31 ueberspringt kurze Monate, letzter Tag nicht`() {
        val on31 = RecurrenceRule(RecurrenceFrequency.MONTHLY, count = 3)
        assertEquals(
            listOf(d("2027-01-31"), d("2027-03-31"), d("2027-05-31")),
            RecurrenceExpander.dates(on31, d("2027-01-31"), limit = limit)
        )
        val last = RecurrenceRule(RecurrenceFrequency.MONTHLY, byMonthDay = listOf(-1), count = 3)
        assertEquals(
            listOf(d("2027-01-31"), d("2027-02-28"), d("2027-03-31")),
            RecurrenceExpander.dates(last, d("2027-01-15"), limit = limit)
        )
    }

    @Test
    fun `jaehrlich am zweiten Sonntag im Mai und am Datum`() {
        val mothersDay = RecurrenceRule(
            RecurrenceFrequency.YEARLY,
            byDay = listOf(WeekdayNum(2, java.time.DayOfWeek.SUNDAY)),
            byMonth = listOf(5),
            count = 2
        )
        assertEquals(listOf(d("2027-05-09"), d("2028-05-14")), RecurrenceExpander.dates(mothersDay, d("2026-11-22"), limit = limit))
        val birthday = RecurrenceRule(RecurrenceFrequency.YEARLY, count = 3)
        assertEquals(
            listOf(d("2026-02-14"), d("2027-02-14"), d("2028-02-14")),
            RecurrenceExpander.dates(birthday, d("2026-02-14"), limit = limit)
        )
    }

    @Test
    fun `taeglich und werktags`() {
        val daily = RecurrenceRule(RecurrenceFrequency.DAILY, interval = 3, count = 3)
        assertEquals(listOf(d("2026-12-30"), d("2027-01-02"), d("2027-01-05")), RecurrenceExpander.dates(daily, d("2026-12-30"), limit = limit))
        val workdays = RecurrenceRule(
            RecurrenceFrequency.WEEKLY,
            byDay = listOf(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY).map { WeekdayNum(0, it) },
            count = 6
        )
        assertEquals(
            listOf("2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27").map(::d),
            RecurrenceExpander.dates(workdays, d("2026-11-20"), limit = limit)
        )
    }

    @Test
    fun `Ausnahmen und Zusatztermine, COUNT zaehlt vor den Ausnahmen`() {
        val rule = RecurrenceRule(RecurrenceFrequency.WEEKLY, count = 3)
        val dates = RecurrenceExpander.dates(
            rule,
            d("2026-12-03"),
            extraDates = listOf(d("2026-12-27")),
            excludedDates = listOf(d("2026-12-10")),
            limit = limit
        )
        assertEquals(listOf(d("2026-12-03"), d("2026-12-17"), d("2026-12-27")), dates)
    }

    @Test
    fun `ohne Regel nur Beginn und eigene Termine`() {
        val dates = RecurrenceExpander.dates(null, d("2026-12-05"), extraDates = listOf(d("2027-03-01"), d("2026-12-20")), limit = limit)
        assertEquals(listOf(d("2026-12-05"), d("2026-12-20"), d("2027-03-01")), dates)
    }

    @Test
    fun `gleiche Ortszeit ueber die Zeitumstellung`() {
        val zone = ZoneId.of("Europe/Berlin")
        val winter = RecurrenceExpander.localStart(d("2027-03-27"), LocalTime.of(19, 30), zone)
        val summer = RecurrenceExpander.localStart(d("2027-04-03"), LocalTime.of(19, 30), zone)
        assertEquals("2027-03-27T18:30:00Z", winter.toInstant().toString())
        assertEquals("2027-04-03T17:30:00Z", summer.toInstant().toString())
    }

    @Test
    fun `RRULE hin und zurueck`() {
        val text = "FREQ=MONTHLY;INTERVAL=2;BYDAY=-1SA,2TU;COUNT=10"
        val rule = RecurrenceRule.parse("RRULE:$text")
        assertEquals(listOf(WeekdayNum(-1, SATURDAY), WeekdayNum(2, TUESDAY)), rule.byDay)
        assertEquals(text, rule.toRRule())
        assertEquals("FREQ=YEARLY;BYMONTHDAY=-1;BYMONTH=2;UNTIL=20301231", RecurrenceRule.parse("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1;UNTIL=20301231").toRRule())
        assertThrows(IllegalArgumentException::class.java) { RecurrenceRule.parse("FREQ=WEEKLY;BYSETPOS=1") }
        assertThrows(IllegalArgumentException::class.java) { RecurrenceRule(RecurrenceFrequency.WEEKLY, interval = 0) }
    }
}
