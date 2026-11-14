package de.maurer.baseservice.config

import de.maurer.baseservice.config.StartupSafetyChecks.Companion.checkDatabaseRole
import de.maurer.baseservice.config.StartupSafetyChecks.Companion.readDatabaseRole
import de.maurer.baseservice.config.StartupSafetyChecks.DatabaseRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName

/**
 * Rollenprüfung gegen echtes PostgreSQL: der Standardbenutzer des Containers
 * ist Superuser, `vereint_app` (db/rls-init.sql) wie in Produktion nicht.
 */
@Testcontainers(disabledWithoutDocker = true)
class StartupSafetyChecksPostgresTest {

    private fun dataSource(database: String, user: String, password: String) = DriverManagerDataSource(
        "jdbc:postgresql://${postgres.host}:${postgres.getMappedPort(PostgreSQLContainer.POSTGRESQL_PORT)}/$database",
        user,
        password
    )

    @Test
    fun `the container superuser is detected and aborts a production start`() {
        val role = readDatabaseRole(dataSource(postgres.databaseName, postgres.username, postgres.password))!!

        assertEquals(postgres.username, role.name)
        assertTrue(role.superuser)
        assertThrows(UnsafeConfigurationException::class.java) { checkDatabaseRole(true, role) }
    }

    @Test
    fun `a role without superuser and BYPASSRLS passes`() {
        val role = readDatabaseRole(dataSource("vereint_app", "vereint_app", "vereint_app"))

        assertEquals(DatabaseRole("vereint_app", superuser = false, bypassRls = false), role)
        assertNull(checkDatabaseRole(true, role!!))
    }

    companion object {
        @Container
        @JvmStatic
        val postgres: PostgreSQLContainer =
            PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine")).withInitScript("db/rls-init.sql")
    }
}
