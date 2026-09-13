package de.maurer.baseservice.service

import org.springframework.stereotype.Component
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Cache der abgeleiteten Rollen und Permissions je Benutzer.
 *
 * Die Invalidierung erfolgt gezielt bei Rollen-, Permission- und Statusänderungen.
 * Der Cache ist absichtlich prozesslokal; die Zusammenführung mit dem
 * Resolver-Cache aus TICKET-006 ist als Folgearbeit vorgesehen.
 */
@Component
class UserPermissionCache {

    data class Entry(
        val roles: Set<String>,
        val customPermissions: Set<String>,
        val effectivePermissions: Set<String>
    )

    private val cache = ConcurrentHashMap<UUID, Entry>()

    fun get(userId: UUID): Entry? = cache[userId]

    fun put(userId: UUID, entry: Entry) {
        cache[userId] = entry
    }

    fun invalidate(userId: UUID) {
        cache.remove(userId)
    }

    fun invalidateAll() {
        cache.clear()
    }

    fun size(): Int = cache.size
}
