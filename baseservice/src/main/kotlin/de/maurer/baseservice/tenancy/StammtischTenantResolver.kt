package de.maurer.baseservice.tenancy

import org.hibernate.context.spi.CurrentTenantIdentifierResolver
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.util.UUID

/**
 * Liefert Hibernate den Stammtisch für `@TenantId`.
 *
 * Ohne Kontext gibt der Resolver [NO_STAMMTISCH] zurück: Abfragen finden dann
 * nichts und Schreibversuche scheitern am Fremdschlüssel. Nur der System-Kontext
 * ist `root` und sieht alle Stammtische.
 */
class StammtischTenantResolver : CurrentTenantIdentifierResolver<Any> {

    override fun resolveCurrentTenantIdentifier(): Any = when (val scope = TenantContext.scope()) {
        is TenantContext.Scope.Stammtisch -> scope.id
        TenantContext.Scope.System -> SYSTEM
        TenantContext.Scope.None -> NO_STAMMTISCH
    }

    override fun validateExistingCurrentSessions(): Boolean = false

    override fun isRoot(tenantId: Any?): Boolean = tenantId == SYSTEM

    companion object {
        /** Platzhalter ohne Daten: Abfragen ohne Stammtisch-Kontext finden nichts. */
        val NO_STAMMTISCH: UUID = UUID(0L, 0L)

        /** Platzhalter für den System-Kontext (Hibernate-`root`). */
        val SYSTEM: UUID = UUID(-1L, -1L)
    }
}

@Configuration
class TenancyHibernateConfig {

    @Bean
    fun stammtischTenantResolverCustomizer(): HibernatePropertiesCustomizer =
        HibernatePropertiesCustomizer { properties ->
            properties["hibernate.tenant_identifier_resolver"] = StammtischTenantResolver()
        }
}
