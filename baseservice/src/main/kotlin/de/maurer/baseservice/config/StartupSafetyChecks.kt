package de.maurer.baseservice.config

import de.maurer.baseservice.crypto.EncryptionProperties
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.InitializingBean
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.diagnostics.AbstractFailureAnalyzer
import org.springframework.boot.diagnostics.FailureAnalysis
import org.springframework.core.env.Environment
import org.springframework.core.env.Profiles
import org.springframework.stereotype.Component
import javax.sql.DataSource

/**
 * Prüft beim Start Einstellungen, die vergessen still zu einem unsicheren
 * Betrieb führen würden.
 *
 * Als Produktion gilt ein Start mit dem Liquibase-Kontext `prod`
 * (`EV_LIQUIBASE_CONTEXTS`, Standard) oder dem Spring-Profil `prod`. Dort
 * bricht der Start ab, wenn
 * - die Anwendungsverschlüsselung aus ist (`DATA_ENCRYPTION_ENABLED`), außer
 *   der Betreiber erlaubt Klartext bewusst mit `DATA_ENCRYPTION_ALLOW_PLAINTEXT=true`;
 * - der Datenbankbenutzer Superuser ist oder `BYPASSRLS` hat. Row-Level-Security
 *   wäre dann wirkungslos, die Gruppen also nicht mehr getrennt.
 *
 * Außerhalb der Produktion (lokal mit `EV_LIQUIBASE_CONTEXTS=dev`, Tests) gibt
 * es dafür nur Warnungen. Die Rollenprüfung entfällt ohne PostgreSQL bzw. mit
 * `vereint.tenancy.row-level-security=false` (H2-Tests).
 */
@Component
class StartupSafetyChecks(
    private val environment: Environment,
    private val encryption: EncryptionProperties,
    private val dataSource: DataSource,
    @Value("\${vereint.encryption.allow-plaintext:false}") private val allowPlaintext: Boolean,
    @Value("\${vereint.tenancy.row-level-security:true}") private val rowLevelSecurity: Boolean
) : InitializingBean {

    private val log = LoggerFactory.getLogger(StartupSafetyChecks::class.java)

    override fun afterPropertiesSet() {
        val production = isProduction(environment)
        checkEncryption(production, encryption.enabled, allowPlaintext)?.let(log::warn)
        if (rowLevelSecurity) {
            readDatabaseRole(dataSource)?.let { role -> checkDatabaseRole(production, role)?.let(log::warn) }
        }
    }

    /** Rechte des Datenbankbenutzers, mit dem der Dienst verbunden ist. */
    data class DatabaseRole(val name: String, val superuser: Boolean, val bypassRls: Boolean)

    companion object {
        private const val PRODUCTION = "prod"

        /** `true` bei Liquibase-Kontext `prod` oder Spring-Profil `prod`. */
        fun isProduction(environment: Environment): Boolean {
            if (environment.acceptsProfiles(Profiles.of(PRODUCTION))) return true
            val contexts = environment.getProperty("spring.liquibase.contexts").orEmpty()
            return contexts.split(',', ' ', '\t').any { it.trim().equals(PRODUCTION, ignoreCase = true) }
        }

        /**
         * Bricht in Produktion ohne Verschlüsselung ab. Gibt sonst eine Warnung
         * zurück, wenn Inhalte im Klartext gespeichert werden, oder `null`.
         */
        fun checkEncryption(production: Boolean, enabled: Boolean, allowPlaintext: Boolean): String? {
            if (enabled) return null
            if (production && !allowPlaintext) {
                throw UnsafeConfigurationException(
                    "Produktionsstart ohne Anwendungsverschlüsselung: Chat, Mitteilungen, Bilder und Videos " +
                        "würden im Klartext gespeichert.",
                    "DATA_ENCRYPTION_ENABLED=true und DATA_ENCRYPTION_KEY (32 Byte, Base64, z. B. " +
                        "`openssl rand -base64 32`) setzen. Nur wer Klartext bewusst will: " +
                        "DATA_ENCRYPTION_ALLOW_PLAINTEXT=true."
                )
            }
            return if (production) {
                "DATA_ENCRYPTION_ALLOW_PLAINTEXT=true: Produktion speichert Inhalte bewusst im Klartext"
            } else {
                null
            }
        }

        /**
         * Bricht in Produktion ab, wenn [role] Row-Level-Security umgeht. Gibt
         * außerhalb der Produktion dafür eine Warnung zurück, sonst `null`.
         */
        fun checkDatabaseRole(production: Boolean, role: DatabaseRole): String? {
            val rights = listOfNotNull("Superuser".takeIf { role.superuser }, "BYPASSRLS".takeIf { role.bypassRls })
            if (rights.isEmpty()) return null
            val problem = "Der Datenbankbenutzer \"${role.name}\" hat ${rights.joinToString(" und ")}. " +
                "Row-Level-Security greift dann nicht, die Gruppen sind in der Datenbank nicht getrennt."
            if (production) {
                throw UnsafeConfigurationException(
                    problem,
                    "Einen eigenen Benutzer ohne diese Rechte anlegen, dem die Datenbank gehört " +
                        "(CREATE ROLE vereint LOGIN PASSWORD '…'; CREATE DATABASE vereint OWNER vereint;), " +
                        "und ihn als VEREINT_DB_USERNAME eintragen. Vorlage: local/postgres/init-databases.sh."
                )
            }
            return "$problem Außerhalb der Produktion nur eine Warnung."
        }

        /** Liest die Rechte des aktuellen Benutzers; `null`, wenn die Datenbank kein PostgreSQL ist. */
        fun readDatabaseRole(dataSource: DataSource): DatabaseRole? = dataSource.connection.use { connection ->
            if (!connection.metaData.databaseProductName.equals("PostgreSQL", ignoreCase = true)) return null
            connection.prepareStatement(
                "select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user"
            ).use { statement ->
                statement.executeQuery().use { rs ->
                    check(rs.next()) { "Datenbankbenutzer nicht in pg_roles gefunden" }
                    DatabaseRole(rs.getString(1), rs.getBoolean(2), rs.getBoolean(3))
                }
            }
        }
    }
}

/** Unsichere Konfiguration, mit der der Dienst nicht startet. */
class UnsafeConfigurationException(message: String, val action: String) : IllegalStateException(message)

/** Gibt [UnsafeConfigurationException] beim Start als verständliche Meldung samt Abhilfe aus. */
class UnsafeConfigurationFailureAnalyzer : AbstractFailureAnalyzer<UnsafeConfigurationException>() {
    override fun analyze(rootFailure: Throwable, cause: UnsafeConfigurationException): FailureAnalysis =
        FailureAnalysis(cause.message ?: "Unsichere Konfiguration", cause.action, cause)
}
