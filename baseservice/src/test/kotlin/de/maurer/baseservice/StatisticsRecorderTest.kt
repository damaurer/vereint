package de.maurer.baseservice

import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.StammtischEntity
import de.maurer.baseservice.domain.StatisticFeature
import de.maurer.baseservice.domain.StatisticRecordEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.StatisticRecordRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.service.StatisticsRecorder
import de.maurer.baseservice.service.StatisticsRecorder.Decision
import de.maurer.baseservice.tenancy.TenantContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import java.util.Optional
import java.util.UUID

/**
 * Gewichtung der Schalter Nutzer > Gruppe > Event: alle Kombinationen und die
 * Wirkung auf das Schreiben eines Eintrags.
 */
class StatisticsRecorderTest {

    @ParameterizedTest(name = "Nutzer={0}, Gruppe={1}, Event={2} -> {3}")
    @CsvSource(
        "true,  true,  true,  RECORD",
        "true,  true,  false, EVENT_DISABLED",
        "true,  false, true,  GROUP_DISABLED",
        "true,  false, false, GROUP_DISABLED",
        "false, true,  true,  USER_DISABLED",
        "false, true,  false, USER_DISABLED",
        "false, false, true,  USER_DISABLED",
        "false, false, false, USER_DISABLED"
    )
    fun `the higher level decides first`(user: Boolean, group: Boolean, event: Boolean, expected: Decision) {
        assertEquals(expected, StatisticsRecorder.decide(user, group, event))
    }

    @ParameterizedTest(name = "Nutzer={0}, Gruppe={1}, ohne Event -> {2}")
    @CsvSource(
        "true,  true,  RECORD",
        "true,  false, GROUP_DISABLED",
        "false, true,  USER_DISABLED",
        "false, false, USER_DISABLED"
    )
    fun `without an event only user and group count`(user: Boolean, group: Boolean, expected: Decision) {
        assertEquals(expected, StatisticsRecorder.decide(user, group, null))
    }

    @ParameterizedTest(name = "Gast, Gruppe={0}, Event={1} -> {2}")
    @CsvSource(
        "true,  true,  RECORD",
        "true,  false, EVENT_DISABLED",
        "false, true,  GROUP_DISABLED",
        "false, false, GROUP_DISABLED"
    )
    fun `guests follow group and event`(group: Boolean, event: Boolean, expected: Decision) {
        assertEquals(expected, StatisticsRecorder.decide(null, group, event))
    }

    private val groupId = UUID.randomUUID()

    private fun recorder(
        groupEnabled: Boolean,
        repository: StatisticRecordRepository,
        user: UserEntity? = null,
        event: EventEntity? = null
    ): StatisticsRecorder {
        val events = mock(EventRepository::class.java)
        if (event != null) `when`(events.findById(event.id)).thenReturn(Optional.of(event))
        val users = mock(UserRepository::class.java)
        if (user != null) `when`(users.findById(user.id)).thenReturn(Optional.of(user))
        val stammtische = mock(StammtischRepository::class.java)
        `when`(stammtische.findById(groupId)).thenReturn(Optional.of(StammtischEntity(id = groupId, name = "G", statisticsEnabled = groupEnabled)))
        return StatisticsRecorder(repository, stammtische, users, events)
    }

    @Test
    fun `a record is written only when every level allows it`() {
        val combinations = listOf(true, false).flatMap { u -> listOf(true, false).flatMap { g -> listOf(true, false).map { e -> Triple(u, g, e) } } }
        combinations.forEach { (userOn, groupOn, eventOn) ->
            val repository = mock(StatisticRecordRepository::class.java)
            val actor = UserEntity(statisticsEnabled = userOn)
            val event = EventEntity(statisticsEnabled = eventOn)
            val written = TenantContext.runIn(groupId) {
                recorder(groupOn, repository, actor, event).record(
                    StatisticFeature.CHAT_MESSAGE,
                    actor = actor,
                    event = event
                )
            }
            assertEquals(userOn && groupOn && eventOn, written, "Nutzer=$userOn Gruppe=$groupOn Event=$eventOn")
            if (written) {
                verify(repository).save(any(StatisticRecordEntity::class.java))
            } else {
                verify(repository, never()).save(any(StatisticRecordEntity::class.java))
            }
        }
    }

    @Test
    fun `nothing is recorded without a group context`() {
        val repository = mock(StatisticRecordRepository::class.java)
        val written = TenantContext.runWithoutTenant {
            recorder(true, repository).record(StatisticFeature.EVENT, actor = UserEntity())
        }
        assertFalse(written)
        verify(repository, never()).save(any(StatisticRecordEntity::class.java))
    }

    @Test
    fun `rounds are counted once per batch`() {
        val repository = mock(StatisticRecordRepository::class.java)
        val first = UUID.randomUUID()
        `when`(repository.existsByFeatureAndSourceId(StatisticFeature.ROUND, first)).thenReturn(true)
        TenantContext.runIn(groupId) {
            recorder(true, repository).round(UserEntity(), EventEntity(), "round", first, 3)
        }
        verify(repository, never()).save(any(StatisticRecordEntity::class.java))
        assertTrue(StatisticsRecorder.decide(true, true, true) == Decision.RECORD)
    }

    @Test
    fun `a foreign drink has no event and follows user and group`() {
        listOf(true to true, true to false, false to true).forEach { (userOn, groupOn) ->
            val repository = mock(StatisticRecordRepository::class.java)
            val actor = UserEntity(statisticsEnabled = userOn)
            val drink = UUID.randomUUID()
            val recorder = recorder(groupOn, repository, actor)
            val record = TenantContext.runIn(groupId) {
                recorder.foreignDrink(actor, drinkId = drink, libraryDrinkId = null, sourceId = UUID.randomUUID())
            }
            assertEquals(userOn && groupOn, TenantContext.runIn(groupId) { recorder.allows(actor) })
            if (userOn && groupOn) {
                assertEquals(StatisticFeature.FOREIGN_DRINK, record?.feature)
                assertEquals(null, record?.eventId)
                assertEquals(drink, record?.drinkId)
                assertEquals(StatisticsRecorder.VARIANT_CATALOG, record?.variant)
            } else {
                assertEquals(null, record)
                verify(repository, never()).save(any(StatisticRecordEntity::class.java))
            }
        }
        assertFalse(TenantContext.runWithoutTenant { recorder(true, mock(StatisticRecordRepository::class.java)).allows(UserEntity()) })
    }
}
