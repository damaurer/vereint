package de.maurer.baseservice.live

import org.springframework.stereotype.Component
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Verteilt „schreibt gerade…“ als Live-Signal `typing` an die anderen Lesenden
 * eines Gesprächs. Nichts davon wird gespeichert.
 *
 * Je Person und Gespräch geht höchstens alle [MIN_INTERVAL_MS] ein Signal
 * hinaus, egal wie oft die App meldet; die App blendet die Anzeige nach
 * einigen Sekunden ohne neues Signal selbst wieder aus.
 */
@Component
class TypingSignals(private val liveUpdateHub: LiveUpdateHub) {

    private val lastSent = ConcurrentHashMap<String, Long>()

    /**
     * Meldet, dass [userId] ([name]) in [conversationId] tippt. [audience] sind
     * alle Lesenden; die tippende Person selbst bekommt nichts.
     * Liefert `false`, wenn das Signal wegen der Drossel entfallen ist.
     */
    fun typing(
        userId: UUID,
        name: String,
        conversationId: UUID,
        stammtischId: String?,
        audience: Collection<UUID>,
        now: Long = System.currentTimeMillis()
    ): Boolean {
        val key = "$userId:$conversationId"
        var allowed = false
        lastSent.compute(key) { _, previous ->
            if (previous == null || now - previous >= MIN_INTERVAL_MS) {
                allowed = true
                now
            } else {
                previous
            }
        }
        if (lastSent.size > MAX_ENTRIES) lastSent.entries.removeIf { now - it.value > MIN_INTERVAL_MS }
        if (!allowed) return false
        val recipients = audience.filter { it != userId }
        if (recipients.isEmpty()) return true
        liveUpdateHub.publish(
            recipients,
            LiveEvent(
                type = LiveEvent.TYPING,
                stammtischId = stammtischId,
                conversationId = conversationId.toString(),
                userId = userId.toString(),
                name = name
            )
        )
        return true
    }

    companion object {
        const val MIN_INTERVAL_MS = 2_000L
        private const val MAX_ENTRIES = 10_000
    }
}
