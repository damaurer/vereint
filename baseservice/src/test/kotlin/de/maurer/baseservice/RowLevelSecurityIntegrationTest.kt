package de.maurer.baseservice

import de.maurer.baseservice.dto.CorrectionRequest
import de.maurer.baseservice.dto.CreateEventRequest
import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.dto.TopupRequest
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.AuditLogService
import de.maurer.baseservice.service.EventService
import de.maurer.baseservice.service.LedgerService
import de.maurer.baseservice.service.PlatformService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.support.DefaultStammtischExtension.Companion.DEFAULT_STAMMTISCH_ID
import de.maurer.baseservice.tenancy.TenantContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.math.BigDecimal
import java.sql.Timestamp
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Trennung der Stammtische auf Datenbankebene (PostgreSQL Row Level Security).
 *
 * Die Anwendung verbindet sich wie in Produktion als Eigentümer der Tabellen
 * ohne Superuser-Rechte. Die Abfragen laufen bewusst mit [JdbcTemplate] am
 * Hibernate-Filter vorbei: Auch dann liefert die Datenbank nur Zeilen des
 * Stammtischs, den die Verbindung gesetzt bekommen hat.
 */
@SpringBootTest(properties = ["vereint.tenancy.row-level-security=true"])
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class RowLevelSecurityIntegrationTest @Autowired constructor(
    private val platformService: PlatformService,
    private val eventService: EventService,
    private val ledgerService: LedgerService,
    private val auditLogService: AuditLogService,
    private val userService: UserService,
    private val jdbcTemplate: JdbcTemplate
) {

    private val platform = UserPrincipal(
        subject = "kc-rls-platform-${UUID.randomUUID()}",
        roles = setOf(UserRole.ADMIN),
        platformAdmin = true
    )

    private fun newStammtisch(): UUID =
        UUID.fromString(platformService.create(CreateStammtischRequest(name = "RLS ${UUID.randomUUID()}"), platform).id)

    private fun newEventInDefault(): UUID = UUID.fromString(
        eventService.createEvent(
            CreateEventRequest(title = "RLS-Test", startsAt = Instant.now().plus(1, ChronoUnit.DAYS)),
            UserPrincipal(subject = "kc-rls-board-${UUID.randomUUID()}", roles = setOf(UserRole.BOARD))
        ).id
    )

    private fun countEvent(id: UUID): Int =
        jdbcTemplate.queryForObject("select count(*) from events where id = ?", Int::class.java, id)!!

    @Test
    fun `the audit log of a Stammtisch can be read under row level security`() {
        val admin = UserPrincipal(subject = "kc-rls-admin-${UUID.randomUUID()}", roles = setOf(UserRole.ADMIN))
        val member = UserPrincipal(subject = "kc-rls-member-${UUID.randomUUID()}", roles = setOf(UserRole.MEMBER))
        val memberId = TenantContext.runWithoutTenant { userService.getOrCreateUser(member) }.id
        ledgerService.topup(TopupRequest(memberId = memberId.toString(), amount = BigDecimal("5.00")), "rls-audit-${UUID.randomUUID()}", admin)

        val page = auditLogService.listAuditLogs(null, null, null, null, null, admin)

        assertTrue(page.content.isNotEmpty())
        // Buchungen ohne Beleg lassen sich auch einzeln und je Mitglied laden.
        val entries = ledgerService.listMemberEntries(memberId, admin)
        assertTrue(entries.isNotEmpty())
        ledgerService.correct(CorrectionRequest(originalEntryId = entries.first().id, reason = "RLS-Test"), "rls-correct-${UUID.randomUUID()}", admin)
        assertEquals(2, ledgerService.listMemberEntries(memberId, admin).size)
    }

    @Test
    fun `every Stammtisch table enforces row level security even for the owner`() {
        val tables = TenantContext.runAsSystem {
            jdbcTemplate.queryForList(
                """
                select c.relname from pg_class c
                join pg_policy p on p.polrelid = c.oid and p.polname = 'stammtisch_isolation'
                where c.relrowsecurity and c.relforcerowsecurity
                """.trimIndent(),
                String::class.java
            )
        }
        assertEquals(35, tables.size, "Tabellen mit Policy: $tables")
        assertTrue("tally_categories" in tables, "Strich-Kategorien brauchen eine Policy: $tables")
    }

    @Test
    fun `rows of one Stammtisch are invisible from another and without a Stammtisch`() {
        val eventA = newEventInDefault()
        val stammtischB = newStammtisch()

        assertEquals(1, countEvent(eventA))
        assertEquals(0, TenantContext.runIn(stammtischB) { countEvent(eventA) })
        assertEquals(0, TenantContext.runWithoutTenant { countEvent(eventA) })
        assertEquals(1, TenantContext.runAsSystem { countEvent(eventA) })
    }

    @Test
    fun `tally categories of one Stammtisch are invisible from another`() {
        val stammtischB = newStammtisch()
        val categoryId = UUID.randomUUID()
        jdbcTemplate.update(
            "insert into tally_categories (id, stammtisch_id, name, price) values (?, ?, 'Bier', 3.50)",
            categoryId,
            DEFAULT_STAMMTISCH_ID
        )
        val count = { jdbcTemplate.queryForObject("select count(*) from tally_categories where id = ?", Int::class.java, categoryId)!! }

        assertEquals(1, count())
        assertEquals(0, TenantContext.runIn(stammtischB) { count() })
        assertEquals(0, TenantContext.runWithoutTenant { count() })
        assertThrows(DataAccessException::class.java) {
            TenantContext.runIn(DEFAULT_STAMMTISCH_ID) {
                jdbcTemplate.update(
                    "insert into tally_categories (id, stammtisch_id, name, price) values (?, ?, 'Eingeschmuggelt', 1.00)",
                    UUID.randomUUID(),
                    stammtischB
                )
            }
        }
    }

    @Test
    fun `rows cannot be written into another Stammtisch`() {
        val stammtischB = newStammtisch()
        val owner = TenantContext.runAsSystem {
            jdbcTemplate.queryForObject("select user_id from stammtisch_members where stammtisch_id = ? limit 1", UUID::class.java, stammtischB)
        }

        assertThrows(DataAccessException::class.java) {
            TenantContext.runIn(DEFAULT_STAMMTISCH_ID) {
                jdbcTemplate.update(
                    "insert into events (id, stammtisch_id, title, starts_at, status, owner_id) values (?, ?, ?, ?, 'draft', ?)",
                    UUID.randomUUID(),
                    stammtischB,
                    "Eingeschmuggelt",
                    Timestamp.from(Instant.now()),
                    owner
                )
            }
        }
        assertEquals(
            0,
            TenantContext.runAsSystem {
                jdbcTemplate.queryForObject("select count(*) from events where title = 'Eingeschmuggelt'", Int::class.java)
            }
        )
    }

    @Test
    fun `statistic records of one Stammtisch are invisible from another`() {
        val stammtischB = newStammtisch()
        val id = UUID.randomUUID()
        TenantContext.runIn(stammtischB) {
            jdbcTemplate.update(
                "insert into statistic_records (id, stammtisch_id, feature, kind, quantity, occurred_at) values (?, ?, 'event', 'triggered', 1, ?)",
                id,
                stammtischB,
                Timestamp.from(Instant.now())
            )
        }
        val count = "select count(*) from statistic_records where id = ?"
        assertEquals(1, TenantContext.runIn(stammtischB) { jdbcTemplate.queryForObject(count, Int::class.java, id) })
        assertEquals(0, TenantContext.runIn(DEFAULT_STAMMTISCH_ID) { jdbcTemplate.queryForObject(count, Int::class.java, id) })
        assertEquals(0, TenantContext.runWithoutTenant { jdbcTemplate.queryForObject(count, Int::class.java, id) })
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
