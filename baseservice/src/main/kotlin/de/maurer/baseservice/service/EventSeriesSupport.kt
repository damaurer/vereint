package de.maurer.baseservice.service

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventSeriesEntity
import de.maurer.baseservice.dto.EventOccurrenceDto
import de.maurer.baseservice.dto.EventSeriesDto
import de.maurer.baseservice.dto.RecurrenceRequest
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.service.recurrence.RecurrenceExpander
import de.maurer.baseservice.service.recurrence.RecurrenceFrequency
import de.maurer.baseservice.service.recurrence.RecurrenceRule
import de.maurer.baseservice.service.recurrence.WeekdayNum
import java.time.LocalDate
import java.time.ZoneId

/** Regel samt zusätzlicher und ausgelassener Termine einer Serie. */
data class SeriesPlan(
    val rule: RecurrenceRule?,
    val extraDates: List<LocalDate>,
    val excludedDates: List<LocalDate>
) {
    fun dates(start: LocalDate, limit: LocalDate): List<LocalDate> =
        RecurrenceExpander.dates(rule, start, extraDates, excludedDates, limit)
}

/** Umrechnung zwischen API, gespeicherter Serie und Regel. */
object EventSeriesSupport {

    val DEFAULT_ZONE: ZoneId = ZoneId.of("Europe/Berlin")

    /** Baut aus der Anfrage die Regel; ungültige Angaben werden zu `400`. */
    fun plan(request: RecurrenceRequest, start: LocalDate): SeriesPlan {
        val frequency = request.frequency?.uppercase() ?: "WEEKLY"
        val extra = request.extraDates.orEmpty().distinct().sorted()
        val excluded = request.excludedDates.orEmpty().distinct().sorted()
        if (request.until != null && request.until.isBefore(start)) {
            throw invalid("until")
        }
        if (frequency == "NONE") return SeriesPlan(null, extra, excluded)
        val freq = runCatching { RecurrenceFrequency.valueOf(frequency) }.getOrElse { throw invalid("frequency") }
        val weekdays = request.weekdays.orEmpty().map { WeekdayNum.dayOf(it) ?: throw invalid("weekdays") }.distinct()
        val positions = request.positions.orEmpty().distinct()
        if (positions.any { it == 0 || it !in -5..5 }) throw invalid("positions")
        val withPositions = freq == RecurrenceFrequency.MONTHLY || freq == RecurrenceFrequency.YEARLY
        val byDay = if (positions.isEmpty() || !withPositions) {
            weekdays.map { WeekdayNum(0, it) }
        } else {
            if (weekdays.isEmpty()) throw invalid("weekdays")
            positions.sorted().flatMap { pos -> weekdays.map { WeekdayNum(pos, it) } }
        }
        val rule = try {
            RecurrenceRule(
                frequency = freq,
                interval = request.interval ?: 1,
                byDay = byDay,
                byMonthDay = request.monthDays.orEmpty().distinct().sorted(),
                byMonth = request.months.orEmpty().distinct().sorted(),
                count = request.count,
                until = request.until
            )
        } catch (ex: IllegalArgumentException) {
            throw invalid(ex.message ?: "rrule")
        }
        return SeriesPlan(rule, extra, excluded)
    }

    fun plan(series: EventSeriesEntity): SeriesPlan = SeriesPlan(
        rule = series.rrule?.let { RecurrenceRule.parse(it) },
        extraDates = parseDates(series.extraDates),
        excludedDates = parseDates(series.excludedDates)
    )

    fun store(series: EventSeriesEntity, plan: SeriesPlan) {
        series.rrule = plan.rule?.toRRule()
        series.extraDates = formatDates(plan.extraDates)
        series.excludedDates = formatDates(plan.excludedDates)
    }

    fun parseDates(value: String?): List<LocalDate> =
        value?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }?.map { LocalDate.parse(it) }.orEmpty()

    fun formatDates(dates: Collection<LocalDate>): String? =
        dates.distinct().sorted().takeIf { it.isNotEmpty() }?.joinToString(",")

    fun zone(series: EventSeriesEntity): ZoneId = runCatching { ZoneId.of(series.timeZone) }.getOrDefault(DEFAULT_ZONE)

    fun toDto(series: EventSeriesEntity, event: EventEntity?, upcoming: List<EventEntity>): EventSeriesDto {
        val plan = plan(series)
        val rule = plan.rule
        val positions = rule?.byDay?.map { it.position }?.filter { it != 0 }?.distinct().orEmpty()
        return EventSeriesDto(
            id = series.id.toString(),
            rrule = rule?.toRRule(),
            frequency = rule?.frequency?.name ?: "NONE",
            interval = rule?.interval ?: 1,
            weekdays = rule?.byDay?.map { WeekdayNum.DAY_CODES.getValue(it.day) }?.distinct().orEmpty(),
            positions = positions,
            monthDays = rule?.byMonthDay.orEmpty(),
            months = rule?.byMonth.orEmpty(),
            count = rule?.count,
            until = rule?.until,
            extraDates = plan.extraDates,
            excludedDates = plan.excludedDates,
            inviteLeadDays = series.inviteLeadDays,
            startsOn = series.startsOn,
            timeZone = series.timeZone,
            occurrenceDate = event?.seriesDate,
            detached = event?.seriesDetached ?: false,
            inviteAllMembers = series.inviteAllMembers,
            upcoming = upcoming.map { EventOccurrenceDto(it.id.toString(), it.startsAt, it.status.name) }
        )
    }

    private fun invalid(detail: String) =
        InvalidRequestException(Msg("error.event.series.invalidRule", detail), ErrorCode.INVALID_REQUEST)
}
