package de.maurer.baseservice.domain

import jakarta.persistence.Column
import jakarta.persistence.MappedSuperclass
import org.hibernate.annotations.TenantId
import java.util.UUID

/**
 * Basis aller Entitäten, die genau einem Stammtisch gehören.
 *
 * Hibernate setzt `stammtisch_id` beim Anlegen aus dem
 * [de.maurer.baseservice.tenancy.TenantContext] und ergänzt jede Abfrage um
 * `stammtisch_id = <aktueller Stammtisch>`. Der Wert ist nach dem Anlegen
 * unveränderlich.
 */
@MappedSuperclass
abstract class StammtischScoped {
    @TenantId
    @Column(name = "stammtisch_id", nullable = false, updatable = false)
    var stammtischId: UUID? = null
}
