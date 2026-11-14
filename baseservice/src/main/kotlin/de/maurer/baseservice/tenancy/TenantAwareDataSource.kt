package de.maurer.baseservice.tenancy

import org.springframework.beans.factory.config.BeanPostProcessor
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.datasource.DelegatingDataSource
import java.sql.Connection
import javax.sql.DataSource

/**
 * Gibt jede Datenbankverbindung mit dem Stammtisch des aktuellen Threads aus.
 *
 * Die Row-Level-Security-Policies (`013-stammtische.xml`, Changeset 165) lesen
 * `vereint.stammtisch_id` und `vereint.rls_bypass`. Beide werden bei jeder
 * Ausgabe aus dem Pool neu gesetzt, sodass keine Verbindung den Kontext einer
 * vorherigen Anfrage behält. Ohne Kontext sind beide leer: PostgreSQL liefert
 * dann keine fachlichen Zeilen und verweigert Schreibzugriffe.
 */
class TenantAwareDataSource(target: DataSource) : DelegatingDataSource(target) {

    override fun getConnection(): Connection = applyContext(super.getConnection())

    override fun getConnection(username: String, password: String): Connection =
        applyContext(super.getConnection(username, password))

    private fun applyContext(connection: Connection): Connection {
        val scope = TenantContext.scope()
        val stammtischId = (scope as? TenantContext.Scope.Stammtisch)?.id?.toString() ?: ""
        val bypass = if (scope == TenantContext.Scope.System) "on" else "off"
        try {
            connection.prepareStatement(
                "select set_config('vereint.stammtisch_id', ?, false), set_config('vereint.rls_bypass', ?, false)"
            ).use { statement ->
                statement.setString(1, stammtischId)
                statement.setString(2, bypass)
                statement.execute()
            }
        } catch (ex: Exception) {
            connection.close()
            throw ex
        }
        return connection
    }
}

/**
 * Schaltet [TenantAwareDataSource] ein (Standard). Die H2-Tests schalten es
 * mit `vereint.tenancy.row-level-security=false` ab, weil H2 weder
 * `set_config` noch Row Level Security kennt.
 */
@Configuration
@ConditionalOnProperty(name = ["vereint.tenancy.row-level-security"], havingValue = "true", matchIfMissing = true)
class TenantAwareDataSourceConfig {

    companion object {
        @Bean
        @JvmStatic
        fun tenantAwareDataSourcePostProcessor(): BeanPostProcessor = object : BeanPostProcessor {
            override fun postProcessAfterInitialization(bean: Any, beanName: String): Any =
                if (bean is DataSource && beanName == "dataSource" && bean !is TenantAwareDataSource) {
                    TenantAwareDataSource(bean)
                } else {
                    bean
                }
        }
    }
}
