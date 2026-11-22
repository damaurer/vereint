package de.maurer.baseservice

import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateEventRequest
import de.maurer.baseservice.dto.InviteMembersRequest
import de.maurer.baseservice.dto.RecurrencePreviewRequest
import de.maurer.baseservice.dto.RecurrenceRequest
import de.maurer.baseservice.dto.RsvpRequest
import de.maurer.baseservice.dto.UpdateEventRequest
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.EventSeriesService
import de.maurer.baseservice.service.EventService
import de.maurer.baseservice.service.MembershipService
import de.maurer.baseservice.service.UserService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters
import java.util.UUID

/**
 * Wiederkehrende Events gegen die echten Migrationen (H2-Profil `test`):
 * Termine anlegen, nur diesen / diesen und folgende / alle bearbeiten,
 * wegfallende Termine löschen oder absagen, Serie beenden, Nachlegen.
 */
@SpringBootTest
@ActiveProfiles("test")
class EventSeriesIntegrationTest @Autowired constructor(
    private val eventSeriesService: EventSeriesService,
    private val eventService: EventService,
    private val userService: UserService,
    private val membershipService: MembershipService,
    private val eventRepository: EventRepository,
    private val eventParticipantRepository: EventParticipantRepository
) {
    private val zone = ZoneId.of("Europe/Berlin")

    private val board = UserPrincipal(
        subject = "kc-series-board-${UUID.randomUUID()}",
        displayName = "Vorstand",
        roles = setOf(UserRole.BOARD, UserRole.MEMBER)
    )

    private fun person(name: String): Pair<UserPrincipal, UserEntity> {
        val principal = UserPrincipal(subject = "kc-series-${UUID.randomUUID()}", displayName = name, roles = setOf(UserRole.MEMBER))
        val user = userService.getOrCreateUser(principal)
        membershipService.addMember(user)
        return principal to user
    }

    private fun nextWeekday(day: DayOfWeek): LocalDate = LocalDate.now(zone).plusDays(1).with(TemporalAdjusters.nextOrSame(day))

    private fun at(date: LocalDate, time: String) = date.atTime(LocalTime.parse(time)).atZone(zone).toInstant()

    private fun create(
        start: LocalDate,
        recurrence: RecurrenceRequest,
        invitees: List<UserEntity> = emptyList(),
        title: String = "Stammtisch ${UUID.randomUUID().toString().take(6)}"
    ) = eventSeriesService.create(
        CreateEventRequest(
            title = title,
            location = "Zur Linde",
            startsAt = at(start, "19:30"),
            endsAt = at(start, "23:00"),
            status = "published",
            inviteUserIds = invitees.map { it.id.toString() },
            recurrence = recurrence
        ),
        board
    )

    private fun occurrences(seriesId: String) =
        eventRepository.findBySeriesIdOrderBySeriesDateAsc(UUID.fromString(seriesId))

    @Test
    fun `weekly series creates dates at the same local time with invitations ahead`() {
        val (_, anna) = person("Anna")
        val start = nextWeekday(DayOfWeek.TUESDAY)
        val first = create(start, RecurrenceRequest(frequency = "WEEKLY", weekdays = listOf("TU"), inviteLeadDays = 7), listOf(anna))

        val series = first.series!!
        assertEquals("FREQ=WEEKLY;BYDAY=TU", series.rrule)
        val events = occurrences(series.id)
        assertEquals(EventSeriesService.MAX_AHEAD, events.size, "höchstens ein halbes Jahr wöchentlich")
        events.forEach { event ->
            val local = event.startsAt.atZone(zone)
            assertEquals(DayOfWeek.TUESDAY, local.dayOfWeek)
            assertEquals(LocalTime.of(19, 30), local.toLocalTime(), "gleiche Ortszeit auch nach der Zeitumstellung")
            assertEquals(210, java.time.Duration.between(event.startsAt, event.endsAt).toMinutes())
            assertEquals(at(event.seriesDate!!.minusDays(7), "19:30"), event.invitationNotifyAt)
            assertTrue(eventParticipantRepository.findByEventIdAndUserId(event.id, anna.id).isPresent)
        }
        assertEquals(6, first.series!!.upcoming.size)

        // Nachlegen ist idempotent.
        eventSeriesService.extendAll()
        assertEquals(EventSeriesService.MAX_AHEAD, occurrences(series.id).size)
    }

    @Test
    fun `this, following and all`() {
        val start = nextWeekday(DayOfWeek.THURSDAY)
        val first = create(start, RecurrenceRequest(frequency = "WEEKLY", count = 6))
        val seriesId = first.series!!.id
        val events = occurrences(seriesId)
        assertEquals(6, events.size)

        // Nur dieser: der zweite Termin wandert auf Freitag und behält das künftig.
        val moved = events[1]
        eventService.updateEvent(
            moved.id,
            UpdateEventRequest(startsAt = at(moved.seriesDate!!.plusDays(1), "20:00"), endsAt = at(moved.seriesDate!!.plusDays(1), "23:00")),
            board
        )

        // Alle: neuer Titel überall außer beim einzeln geänderten Termin.
        eventSeriesService.update(events[0].id, UpdateEventRequest(title = "Stammtisch neu", scope = "all"), board)
        val afterAll = occurrences(seriesId)
        assertEquals(listOf(false, true, false, false, false, false), afterAll.map { it.title != "Stammtisch neu" })
        assertEquals(DayOfWeek.FRIDAY, afterAll[1].startsAt.atZone(zone).dayOfWeek)

        // Dieser und folgende: ab dem vierten Termin 18:00 Uhr in einer neuen Serie.
        val fourth = afterAll[3]
        val updated = eventSeriesService.update(fourth.id, UpdateEventRequest(startsAt = at(fourth.seriesDate!!, "18:00"), endsAt = at(fourth.seriesDate!!, "22:00"), scope = "following"), board)
        assertNotEquals(seriesId, updated.series!!.id)
        assertEquals(3, occurrences(seriesId).size)
        val tail = occurrences(updated.series!!.id)
        assertEquals(3, tail.size, "COUNT läuft in der neuen Serie mit dem Rest weiter")
        assertTrue(tail.all { it.startsAt.atZone(zone).toLocalTime() == LocalTime.of(18, 0) })
        assertTrue(occurrences(seriesId).all { it.startsAt.atZone(zone).toLocalTime() != LocalTime.of(18, 0) })
    }

    @Test
    fun `rule change deletes untouched dates and cancels answered ones`() {
        val (annaP, anna) = person("Anna")
        val start = nextWeekday(DayOfWeek.MONDAY)
        val first = create(start, RecurrenceRequest(frequency = "WEEKLY", weekdays = listOf("MO"), count = 4), listOf(anna))
        val seriesId = first.series!!.id
        val events = occurrences(seriesId)
        eventService.respond(events[2].id, RsvpRequest("accepted"), annaP)

        eventSeriesService.update(
            events[0].id,
            UpdateEventRequest(scope = "all", recurrence = RecurrenceRequest(frequency = "WEEKLY", weekdays = listOf("WE"), count = 4)),
            board
        )
        val after = occurrences(seriesId)
        val answered = after.single { it.id == events[2].id }
        assertEquals(EventStatus.cancelled, answered.status, "mit Zusage wird abgesagt statt gelöscht")
        assertTrue(after.filter { it.status != EventStatus.cancelled }.all { it.startsAt.atZone(zone).dayOfWeek == DayOfWeek.WEDNESDAY })
        assertEquals(4, after.count { it.status != EventStatus.cancelled })
        assertFalse(eventRepository.existsById(events[1].id), "unberührte Termine verschwinden")
    }

    @Test
    fun `cancel following ends the series and nothing comes back`() {
        val start = nextWeekday(DayOfWeek.WEDNESDAY)
        val first = create(start, RecurrenceRequest(frequency = "WEEKLY"))
        val seriesId = first.series!!.id
        val third = occurrences(seriesId)[2]

        eventSeriesService.update(third.id, UpdateEventRequest(status = "cancelled", scope = "following"), board)
        val left = occurrences(seriesId)
        assertEquals(2, left.count { it.status == EventStatus.published })
        assertEquals(EventStatus.cancelled, left.single { it.id == third.id }.status)
        eventSeriesService.extendAll()
        assertEquals(left.size, occurrences(seriesId).size)
    }

    @Test
    fun `monthly last saturday, irregular dates, invite following and preview`() {
        val (_, ben) = person("Ben")
        val first = create(LocalDate.now(zone).plusDays(1), RecurrenceRequest(frequency = "MONTHLY", weekdays = listOf("SA"), positions = listOf(-1), count = 3))
        val dates = occurrences(first.series!!.id).map { it.seriesDate!! }
        assertEquals(3, dates.size)
        assertTrue(dates.all { it.dayOfWeek == DayOfWeek.SATURDAY && it.plusWeeks(1).month != it.month })

        eventSeriesService.inviteFollowing(UUID.fromString(first.id), InviteMembersRequest(userIds = listOf(ben.id.toString()), scope = "following"), board)
        assertTrue(occurrences(first.series!!.id).all { eventParticipantRepository.findByEventIdAndUserId(it.id, ben.id).isPresent })

        val base = LocalDate.now(zone).plusDays(3)
        val irregular = create(base, RecurrenceRequest(frequency = "NONE", extraDates = listOf(base.plusDays(10), base.plusDays(40))))
        assertEquals(listOf(base, base.plusDays(10), base.plusDays(40)), occurrences(irregular.series!!.id).map { it.seriesDate })

        val preview = eventSeriesService.preview(
            RecurrencePreviewRequest(at(base, "19:00"), RecurrenceRequest(frequency = "DAILY", interval = 2), limit = 3)
        )
        assertEquals(listOf(at(base, "19:00"), at(base.plusDays(2), "19:00"), at(base.plusDays(4), "19:00")), preview.dates)
        assertTrue(preview.more)

        assertThrows(InvalidRequestException::class.java) {
            create(base, RecurrenceRequest(frequency = "MONTHLY", positions = listOf(-1)))
        }
    }
}
