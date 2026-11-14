package de.maurer.baseservice.tenancy

import org.springframework.stereotype.Component
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

/**
 * Wechselt den Stammtisch-Kontext sicher.
 *
 * Hibernate legt den Stammtisch beim Öffnen einer Sitzung fest, die
 * Datenbankverbindung bekommt ihn beim Ausleihen. Ein Wechsel innerhalb einer
 * laufenden Transaktion würde deshalb weiter die alte Sitzung und Verbindung
 * nutzen. Diese Klasse öffnet für den neuen Kontext immer eine eigene
 * Transaktion (`REQUIRES_NEW`) mit eigener Sitzung und Verbindung.
 */
@Component
class TenantTransactions(transactionManager: PlatformTransactionManager) {

    private val readWrite = TransactionTemplate(transactionManager).apply {
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
    }

    private val readOnly = TransactionTemplate(transactionManager).apply {
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
        isReadOnly = true
    }

    fun <T> inStammtisch(stammtischId: UUID, block: () -> T): T =
        TenantContext.runIn(stammtischId) { readWrite.execute { block() } as T }

    fun <T> readInStammtisch(stammtischId: UUID, block: () -> T): T =
        TenantContext.runIn(stammtischId) { readOnly.execute { block() } as T }

    fun <T> asSystem(block: () -> T): T =
        TenantContext.runAsSystem { readWrite.execute { block() } as T }

    fun <T> readAsSystem(block: () -> T): T =
        TenantContext.runAsSystem { readOnly.execute { block() } as T }
}
