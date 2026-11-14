package de.maurer.baseservice

import de.maurer.baseservice.domain.AccountingMode
import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.IdempotencyRecordEntity
import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.PurchaseSource
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.IdempotencyRecordRepository
import de.maurer.baseservice.repository.LedgerEntryRepository
import de.maurer.baseservice.repository.UserRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataIntegrityViolationException
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
import java.util.UUID
import javax.sql.DataSource

/**
 * Migrations- und Constraint-Test gegen die Zieldatenbank PostgreSQL.
 *
 * Läuft nur mit verfügbarer Docker-Umgebung; ohne Docker wird die Klasse durch
 * `@Testcontainers(disabledWithoutDocker = true)` übersprungen, damit die restliche
 * Suite (H2-basierte Spring-Context-Tests) weiterhin ausführbar bleibt.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class PostgresMigrationIntegrationTest @Autowired constructor(
    private val dataSource: DataSource,
    private val userRepository: UserRepository,
    private val eventRepository: EventRepository,
    private val drinkCatalogRepository: DrinkCatalogRepository,
    private val ledgerEntryRepository: LedgerEntryRepository,
    private val idempotencyRecordRepository: IdempotencyRecordRepository,
    private val jdbcTemplate: JdbcTemplate
) {

    @Test
    fun `liquibase migration runs completely against postgresql`() {
        dataSource.connection.use { connection ->
            assertEquals("PostgreSQL", connection.metaData.databaseProductName)

            connection.createStatement().use { statement ->
                statement.executeQuery("select count(*) from databasechangelog").use { rs ->
                    rs.next()
                    assertTrue(rs.getInt(1) >= 22, "Alle Changesets müssen ausgeführt worden sein")
                }
            }

            connection.createStatement().use { statement ->
                statement.executeQuery(
                    """
                    select data_type from information_schema.columns
                    where table_name = 'ledger_entries' and column_name = 'created_at'
                    """.trimIndent()
                ).use { rs ->
                    rs.next()
                    assertEquals("timestamp with time zone", rs.getString(1))
                }
            }

            connection.createStatement().use { statement ->
                statement.executeQuery(
                    """
                    select count(*) from pg_indexes
                    where tablename = 'ledger_entries'
                      and indexname in ('idx_ledger_entries_event_member_created', 'idx_ledger_entries_created_at')
                    """.trimIndent()
                ).use { rs ->
                    rs.next()
                    assertEquals(2, rs.getInt(1))
                }
            }
        }
    }

    /**
     * Die Entität bildet `events.status` als Enum ab; der `CHECK`-Constraint wird
     * deshalb über natives SQL geprüft.
     */
    @Test
    fun `check constraints reject values outside the documented data contracts`() {
        val owner = userRepository.saveAndFlush(newUser())

        assertThrows(DataIntegrityViolationException::class.java) {
            jdbcTemplate.update(
                "insert into events (id, stammtisch_id, title, starts_at, status, owner_id) values (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(),
                UUID.fromString("00000000-0000-0000-0000-000000000001"),
                "Falscher Status",
                Timestamp.from(Instant.now()),
                "activ",
                owner.id
            )
        }
    }

    @Test
    fun `idempotency records are unique per scope and key`() {
        val key = "idem-${UUID.randomUUID()}"

        idempotencyRecordRepository.saveAndFlush(record(key, "purchase"))
        idempotencyRecordRepository.saveAndFlush(record(key, "correction"))

        assertThrows(DataIntegrityViolationException::class.java) {
            idempotencyRecordRepository.saveAndFlush(record(key, "purchase"))
        }
    }

    @Test
    fun `ledger entries cannot be updated or deleted`() {
        val owner = userRepository.saveAndFlush(newUser())
        val event = eventRepository.saveAndFlush(
            EventEntity(
                id = UUID.randomUUID(),
                title = "Append-only Test",
                startsAt = Instant.now(),
                owner = owner
            )
        )
        val drink = drinkCatalogRepository.saveAndFlush(
            DrinkCatalogEntity(
                id = UUID.randomUUID(),
                name = "Club Mate",
                defaultPrice = BigDecimal("2.50")
            )
        )
        val entry = ledgerEntryRepository.saveAndFlush(
            LedgerEntryEntity(
                id = UUID.randomUUID(),
                event = event,
                member = owner,
                drink = drink,
                amount = BigDecimal("2.50"),
                accountingMode = AccountingMode.credit,
                source = PurchaseSource.pwaBarcode,
                actor = owner,
                idempotencyKey = "ledger-${UUID.randomUUID()}"
            )
        )

        dataSource.connection.use { connection ->
            connection.createStatement().use { statement ->
                assertThrows(java.sql.SQLException::class.java) {
                    statement.executeUpdate("update ledger_entries set amount = 9.99 where id = '${entry.id}'")
                }
            }
            connection.createStatement().use { statement ->
                assertThrows(java.sql.SQLException::class.java) {
                    statement.executeUpdate("delete from ledger_entries where id = '${entry.id}'")
                }
            }
        }
    }

    private fun newUser() = UserEntity(
        id = UUID.randomUUID(),
        keycloakSubject = "kc-${UUID.randomUUID()}",
        displayName = "Postgres Testnutzer"
    )

    private fun record(key: String, scope: String) = IdempotencyRecordEntity(
        id = UUID.randomUUID(),
        idempotencyKey = key,
        scope = scope,
        expiresAt = Instant.now().plusSeconds(3600)
    )

    companion object {
        @Container
        @JvmStatic
        val postgres: PostgreSQLContainer =
            PostgreSQLContainer(DockerImageName.parse("postgres:18-alpine"))

        @DynamicPropertySource
        @JvmStatic
        fun datasourceProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
            registry.add("spring.datasource.driver-class-name") { "org.postgresql.Driver" }
            registry.add("spring.jpa.properties.hibernate.dialect") { "org.hibernate.dialect.PostgreSQLDialect" }
        }
    }
}
