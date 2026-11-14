package de.maurer.baseservice.config

import de.maurer.baseservice.config.StartupSafetyChecks.Companion.checkDatabaseRole
import de.maurer.baseservice.config.StartupSafetyChecks.Companion.checkEncryption
import de.maurer.baseservice.config.StartupSafetyChecks.Companion.isProduction
import de.maurer.baseservice.config.StartupSafetyChecks.Companion.readDatabaseRole
import de.maurer.baseservice.config.StartupSafetyChecks.DatabaseRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.core.io.ClassPathResource
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.mock.env.MockEnvironment
import javax.sql.DataSource

/** Startprüfungen gegen unsicheren Betrieb (Verschlüsselung, Datenbankrechte). */
class StartupSafetyChecksTest {

    private fun env(contexts: String? = null, vararg profiles: String) = MockEnvironment().apply {
        contexts?.let { setProperty("spring.liquibase.contexts", it) }
        setActiveProfiles(*profiles)
    }

    @Test
    fun `production is the Liquibase context prod or the Spring profile prod`() {
        assertTrue(isProduction(env("prod")))
        assertTrue(isProduction(env("dev, prod")))
        assertTrue(isProduction(env(" PROD ")))
        assertTrue(isProduction(env("dev", "prod")))
        assertFalse(isProduction(env("dev")))
        assertFalse(isProduction(env("test")))
        assertFalse(isProduction(env("production-like")))
        assertFalse(isProduction(env()))
    }

    @Test
    fun `the shipped defaults count as production and keep signup closed`() {
        val yaml = YamlPropertiesFactoryBean().apply { setResources(ClassPathResource("application.yaml")) }.getObject()!!
        assertEquals("\${EV_LIQUIBASE_CONTEXTS:prod}", yaml.getProperty("spring.liquibase.contexts"))
        assertEquals("\${SIGNUP_ENABLED:false}", yaml.getProperty("vereint.signup.enabled"))
        assertEquals("\${DATA_ENCRYPTION_ALLOW_PLAINTEXT:false}", yaml.getProperty("vereint.encryption.allow-plaintext"))
    }

    @Test
    fun `production without encryption aborts unless plaintext is allowed explicitly`() {
        val error = assertThrows(UnsafeConfigurationException::class.java) {
            checkEncryption(production = true, enabled = false, allowPlaintext = false)
        }
        assertTrue(error.message!!.contains("Klartext"))
        assertTrue(error.action.contains("DATA_ENCRYPTION_ENABLED=true"))
        assertTrue(error.action.contains("DATA_ENCRYPTION_ALLOW_PLAINTEXT=true"))

        assertNotNull(checkEncryption(production = true, enabled = false, allowPlaintext = true))
        assertNull(checkEncryption(production = true, enabled = true, allowPlaintext = false))
        assertNull(checkEncryption(production = false, enabled = false, allowPlaintext = false))
    }

    @Test
    fun `a superuser or BYPASSRLS role aborts in production and only warns elsewhere`() {
        val superuser = DatabaseRole("postgres", superuser = true, bypassRls = true)
        val bypass = DatabaseRole("vereint", superuser = false, bypassRls = true)
        val regular = DatabaseRole("vereint", superuser = false, bypassRls = false)

        val error = assertThrows(UnsafeConfigurationException::class.java) { checkDatabaseRole(true, superuser) }
        assertTrue(error.message!!.contains("\"postgres\" hat Superuser und BYPASSRLS"))
        assertTrue(error.action.contains("init-databases.sh"))
        assertThrows(UnsafeConfigurationException::class.java) { checkDatabaseRole(true, bypass) }
        assertNull(checkDatabaseRole(true, regular))

        assertTrue(checkDatabaseRole(false, superuser)!!.contains("Row-Level-Security"))
        assertNull(checkDatabaseRole(false, regular))
    }

    @Test
    fun `the role check is skipped for databases other than PostgreSQL`() {
        assertNull(readDatabaseRole(h2()))
    }

    @Test
    fun `the failure analyzer explains the problem and the fix`() {
        val cause = UnsafeConfigurationException("Problem", "Abhilfe")
        val analysis = UnsafeConfigurationFailureAnalyzer().analyze(RuntimeException("wrapper", cause))!!
        assertEquals("Problem", analysis.description)
        assertEquals("Abhilfe", analysis.action)
    }

    private val runner = ApplicationContextRunner()
        .withUserConfiguration(EncryptionConfig::class.java)
        .withBean(DataSource::class.java, { h2() })
        .withBean(StartupSafetyChecks::class.java)
        .withPropertyValues("vereint.tenancy.row-level-security=true")

    @Test
    fun `a production start without encryption key does not start`() {
        runner.withPropertyValues("spring.liquibase.contexts=prod").run { context ->
            assertNotNull(context.startupFailure)
            var cause: Throwable? = context.startupFailure
            while (cause != null && cause !is UnsafeConfigurationException) cause = cause.cause
            assertNotNull(cause, "Startfehler: ${context.startupFailure}")
        }
    }

    @Test
    fun `production starts with encryption or explicit plaintext, development without`() {
        runner.withPropertyValues(
            "spring.liquibase.contexts=prod",
            "vereint.encryption.enabled=true",
            "vereint.encryption.key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        ).run { context -> assertNull(context.startupFailure) }
        runner.withPropertyValues("spring.liquibase.contexts=prod", "vereint.encryption.allow-plaintext=true")
            .run { context -> assertNull(context.startupFailure) }
        runner.withPropertyValues("spring.liquibase.contexts=dev").run { context -> assertNull(context.startupFailure) }
    }

    private fun h2(): DataSource =
        DriverManagerDataSource("jdbc:h2:mem:startup-checks;DB_CLOSE_DELAY=-1", "sa", "")
}
