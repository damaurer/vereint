package de.maurer.baseservice.tenancy

import java.util.UUID

/**
 * Der Stammtisch, in dessen Namen der aktuelle Thread arbeitet.
 *
 * Jede fachliche Tabelle trägt eine Spalte `stammtisch_id`. Hibernate filtert
 * über `@TenantId` automatisch auf den Stammtisch aus diesem Kontext, und
 * PostgreSQL erzwingt dieselbe Grenze zusätzlich per Row Level Security (siehe
 * `docs/domains/stammtische.md`).
 *
 * Drei Zustände:
 * - [Scope.Stammtisch]: normale Anfragen eines Mitglieds.
 * - [Scope.System]: Plattformaufgaben ohne Stammtischbezug, etwa das Auflösen
 *   eines Einladungs-Tokens. Nur gezielt und kurz einsetzen.
 * - [Scope.None]: kein Kontext. Fachdaten sind dann weder lesbar noch
 *   schreibbar (`fail closed`).
 */
object TenantContext {

    sealed interface Scope {
        data class Stammtisch(val id: UUID) : Scope
        data object System : Scope
        data object None : Scope
    }

    private val current = ThreadLocal<Scope>()

    fun scope(): Scope = current.get() ?: Scope.None

    /** Stammtisch des aktuellen Threads oder `null` (System oder kein Kontext). */
    fun stammtischId(): UUID? = (scope() as? Scope.Stammtisch)?.id

    fun isSystem(): Boolean = scope() == Scope.System

    fun requireStammtischId(): UUID =
        stammtischId() ?: throw IllegalStateException("Kein Stammtisch-Kontext gesetzt")

    fun <T> runIn(stammtischId: UUID, block: () -> T): T = runWith(Scope.Stammtisch(stammtischId), block)

    fun <T> runAsSystem(block: () -> T): T = runWith(Scope.System, block)

    fun <T> runWithoutTenant(block: () -> T): T = runWith(Scope.None, block)

    private fun <T> runWith(scope: Scope, block: () -> T): T {
        val previous = current.get()
        current.set(scope)
        try {
            return block()
        } finally {
            if (previous == null) current.remove() else current.set(previous)
        }
    }

    /** Für den Request-Filter: setzt den Kontext bis [clear]. */
    internal fun set(scope: Scope) {
        current.set(scope)
    }

    internal fun clear() {
        current.remove()
    }
}
