package de.maurer.baseservice

import de.maurer.baseservice.dto.CreateEventRequest
import de.maurer.baseservice.dto.RecurrenceRequest
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.ChatService
import de.maurer.baseservice.service.EventSeriesService
import de.maurer.baseservice.service.MembershipService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.support.DefaultStammtischExtension.Companion.DEFAULT_STAMMTISCH_ID
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Timestamp
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Changeset 371 gegen PostgreSQL: Chats, die es vor dem Serienchat je Termin
 * gab, werden zu einem Chat der Serie zusammengeführt. Der Test legt solche
 * Alt-Chats an und führt das SQL des Changesets erneut aus.
 */
@SpringBootTest(properties = ["vereint.tenancy.row-level-security=true"])
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class SeriesChatMigrationPostgresTest @Autowired constructor(
    private val eventSeriesService: EventSeriesService,
    private val userService: UserService,
    private val membershipService: MembershipService,
    private val chatService: ChatService,
    private val jdbcTemplate: JdbcTemplate,
    private val transactionTemplate: TransactionTemplate
) {

    private fun mergeSql(): String {
        val xml = Files.readString(Path.of("src/main/resources/db/changelog/changes/033-series-chat.xml"))
        val block = xml.substringAfter("id=\"371-merge-series-chats\"").substringAfter("<sql splitStatements=\"false\">").substringBefore("</sql>")
        return block.replace("&lt;", "<").replace("&gt;", ">")
    }

    private fun oldChat(eventId: UUID, createdAt: Instant): UUID {
        val id = UUID.randomUUID()
        jdbcTemplate.update(
            "insert into conversations (id, stammtisch_id, type, event_id, title, direct_key, created_at, version) values (?, ?, 'event', ?, 'Alt', ?, ?, 0)",
            id, DEFAULT_STAMMTISCH_ID, eventId, ChatService.eventConversationKey(eventId), Timestamp.from(createdAt)
        )
        return id
    }

    private fun message(conversationId: UUID, senderId: UUID, text: String) {
        jdbcTemplate.update(
            "insert into chat_messages (id, stammtisch_id, conversation_id, sender_id, message, created_at) values (?, ?, ?, ?, ?, ?)",
            UUID.randomUUID(), DEFAULT_STAMMTISCH_ID, conversationId, senderId, text, Timestamp.from(Instant.now())
        )
    }

    private fun member(conversationId: UUID, userId: UUID, lastRead: Instant) {
        jdbcTemplate.update(
            "insert into conversation_members (id, stammtisch_id, conversation_id, user_id, joined_at, last_read_at) values (?, ?, ?, ?, ?, ?)",
            UUID.randomUUID(), DEFAULT_STAMMTISCH_ID, conversationId, userId, Timestamp.from(lastRead), Timestamp.from(lastRead)
        )
    }

    @Test
    fun `chats of single dates are merged into one chat of the series`() {
        val board = UserPrincipal(subject = "kc-merge-board-${UUID.randomUUID()}", displayName = "Vorstand", roles = setOf(UserRole.BOARD, UserRole.MEMBER))
        val anna = UserPrincipal(subject = "kc-merge-anna-${UUID.randomUUID()}", displayName = "Anna", roles = setOf(UserRole.MEMBER))
        val annaUser = userService.getOrCreateUser(anna)
        membershipService.addMember(annaUser)
        val start = Instant.now().plus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS)
        val first = eventSeriesService.create(
            CreateEventRequest(
                title = "Stammtisch Merge",
                startsAt = start,
                status = "published",
                inviteUserIds = listOf(annaUser.id.toString()),
                recurrence = RecurrenceRequest(frequency = "WEEKLY", count = 3)
            ),
            board
        )
        val seriesId = UUID.fromString(first.series!!.id)
        val events = jdbcTemplate.queryForList("select id from events where series_id = ? order by series_date", UUID::class.java, seriesId).map { it!! }

        val now = Instant.now().truncatedTo(ChronoUnit.SECONDS)
        val older = oldChat(events[0], now.minusSeconds(600))
        val newer = oldChat(events[1], now.minusSeconds(60))
        message(older, annaUser.id, "erster Abend")
        message(newer, annaUser.id, "zweiter Abend")
        member(older, annaUser.id, now.minusSeconds(500))
        member(newer, annaUser.id, now.minusSeconds(30))

        transactionTemplate.executeWithoutResult { jdbcTemplate.execute(mergeSql()) }

        val chats = jdbcTemplate.queryForList(
            "select id, event_id, series_id, direct_key from conversations where id in (?, ?)", older, newer
        )
        assertEquals(1, chats.size, "nur der älteste Chat bleibt")
        val chat = chats.single()
        assertEquals(older, chat["id"])
        assertNull(chat["event_id"])
        assertEquals(seriesId, chat["series_id"])
        assertEquals("series:$seriesId", chat["direct_key"])
        assertEquals(2, jdbcTemplate.queryForObject("select count(*) from chat_messages where conversation_id = ?", Int::class.java, older))
        val lastRead = jdbcTemplate.queryForList(
            "select last_read_at from conversation_members where conversation_id = ? and user_id = ?", Timestamp::class.java, older, annaUser.id
        )
        assertEquals(listOf(Timestamp.from(now.minusSeconds(30))), lastRead, "eine Zeile mit dem neueren Lesestand")

        // Die App findet den zusammengeführten Chat über jeden Termin.
        assertEquals(older.toString(), chatService.getConversation(events[2], anna).id)
        assertEquals(listOf("erster Abend", "zweiter Abend"), chatService.listMessages(events[2], anna).map { it.message }.sorted())
    }

    companion object {
        @Container
        @JvmStatic
        val postgres: PostgreSQLContainer =
            PostgreSQLContainer(DockerImageName.parse("postgres:18-alpine")).withInitScript("db/rls-init.sql")

        @DynamicPropertySource
        @JvmStatic
        fun datasourceProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url") {
                "jdbc:postgresql://${postgres.host}:${postgres.getMappedPort(PostgreSQLContainer.POSTGRESQL_PORT)}/vereint_app"
            }
            registry.add("spring.datasource.username") { "vereint_app" }
            registry.add("spring.datasource.password") { "vereint_app" }
            registry.add("spring.datasource.driver-class-name") { "org.postgresql.Driver" }
            registry.add("spring.jpa.properties.hibernate.dialect") { "org.hibernate.dialect.PostgreSQLDialect" }
        }
    }
}
