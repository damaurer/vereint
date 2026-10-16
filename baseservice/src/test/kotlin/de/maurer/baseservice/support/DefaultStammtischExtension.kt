package de.maurer.baseservice.support

import de.maurer.baseservice.tenancy.TenantContext
import org.junit.jupiter.api.extension.AfterEachCallback
import org.junit.jupiter.api.extension.BeforeEachCallback
import org.junit.jupiter.api.extension.ExtensionContext
import java.util.UUID

/**
 * Jeder Test läuft im Stammtisch, den die Migration `013-stammtische.xml`
 * für alle bisherigen Daten anlegt. So gelten bestehende Tests unverändert für
 * „einen Stammtisch“; Tests zur Trennung wechseln selbst mit
 * [TenantContext.runIn]. Registriert über `META-INF/services` und
 * `junit-platform.properties` für alle Tests.
 */
class DefaultStammtischExtension : BeforeEachCallback, AfterEachCallback {

    override fun beforeEach(context: ExtensionContext) {
        TenantContext.set(TenantContext.Scope.Stammtisch(DEFAULT_STAMMTISCH_ID))
    }

    override fun afterEach(context: ExtensionContext) {
        TenantContext.clear()
    }

    companion object {
        val DEFAULT_STAMMTISCH_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
    }
}
