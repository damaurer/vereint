package de.maurer.baseservice.live

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import jakarta.annotation.PreDestroy

/**
 * Ein Signal an die offenen Live-Verbindungen einer Person.
 *
 * Es trägt bewusst keinen Inhalt, nur was sich geändert hat: Die App lädt die
 * betroffene Liste danach selbst und berechtigt nach. So gelangen keine
 * Chattexte in einen Kanal, der an der Autorisierung der Endpunkte vorbeigeht.
 *
 * - `chat`: Nachricht oder Reaktion in einem Gruppen-, Event- oder Moment-Chat
 * - `direct`: Nachricht oder Reaktion in einer Direktnachricht
 * - `read`: eigener Lesestand hat sich geändert (Zähler auf anderen Geräten)
 * - `notification`: neue Mitteilung (Einladung, Rundbrief, Freunde …)
 * - `receipt`: eigene Nachrichten wurden zugestellt oder gelesen (Haken)
 * - `typing`: jemand schreibt gerade in diesem Gespräch; trägt nur Id und
 *   Anzeigenamen der Person, die alle Lesenden ohnehin sehen
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class LiveEvent(
    val type: String,
    val stammtischId: String? = null,
    val conversationId: String? = null,
    val userId: String? = null,
    val name: String? = null
) {
    companion object {
        const val CHAT = "chat"
        const val DIRECT = "direct"
        const val READ = "read"
        const val NOTIFICATION = "notification"
        const val RECEIPT = "receipt"
        const val TYPING = "typing"
    }
}

/**
 * Hält die Live-Verbindungen (Server-Sent Events) aller angemeldeten Geräte und
 * verteilt [LiveEvent]s an sie.
 *
 * Die Verbindungen liegen im Speicher dieser einen Instanz. Signale gehen erst
 * nach dem Commit der auslösenden Transaktion hinaus, damit die App beim
 * Nachladen die neuen Daten schon sieht. Eine Verbindung endet nach
 * [CONNECTION_TIMEOUT_MS]; der Browser verbindet sich dann neu und holt sich
 * dabei über den BFF ein frisches Token, sodass ein gesperrtes Konto spätestens
 * dann keine Signale mehr bekommt.
 */
@Component
class LiveUpdateHub(private val objectMapper: ObjectMapper) {

    private val log = LoggerFactory.getLogger(LiveUpdateHub::class.java)
    private val connections = ConcurrentHashMap<UUID, CopyOnWriteArrayList<SseEmitter>>()

    // Ein eigener Thread, damit eine langsame Verbindung keine Anfrage aufhält.
    private val executor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "live-dispatch").apply { isDaemon = true }
    }

    /** Öffnet eine Verbindung für [userId]; ältere Verbindungen über [MAX_CONNECTIONS_PER_USER] werden geschlossen. */
    fun connect(userId: UUID, timeoutMs: Long = CONNECTION_TIMEOUT_MS): SseEmitter {
        val emitter = SseEmitter(timeoutMs)
        val list = connections.computeIfAbsent(userId) { CopyOnWriteArrayList() }
        list.add(emitter)
        while (list.size > MAX_CONNECTIONS_PER_USER) {
            list.removeAt(0).let { runCatching { it.complete() } }
        }
        val remove = { remove(userId, emitter) }
        emitter.onCompletion(remove)
        emitter.onTimeout { remove(); runCatching { emitter.complete() } }
        emitter.onError { remove() }
        // Sofort ein erstes Ereignis, damit Proxys die Antwort beginnen und die App
        // weiß, dass die Verbindung steht (sie gleicht dann einmal ab).
        send(userId, emitter, SseEmitter.event().name("ready").data("{}", MediaType.APPLICATION_JSON).reconnectTime(RECONNECT_MS))
        return emitter
    }

    /** Signalisiert [event] an alle Geräte der [userIds], nach dem Commit der laufenden Transaktion. */
    fun publish(userIds: Collection<UUID>, event: LiveEvent) {
        val recipients = userIds.toSet().filter { connections.containsKey(it) }
        if (recipients.isEmpty()) return
        val task = Runnable { recipients.forEach { deliver(it, event) } }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() = executor.execute(task)
            })
        } else {
            executor.execute(task)
        }
    }

    /** Beendet alle Verbindungen von [userId]; der Browser baut sie neu auf und wird dabei erneut geprüft. */
    internal fun disconnect(userId: UUID) {
        connections.remove(userId)?.forEach { runCatching { it.complete() } }
    }

    /** Anzahl offener Verbindungen (für Tests und Betrieb). */
    fun connectionCount(): Int = connections.values.sumOf { it.size }

    /**
     * Lebenszeichen alle 25 s: hält Proxys und Mobilfunknetze von einem Abbruch
     * wegen Leerlauf ab, und die App erkennt an seinem Ausbleiben eine tote
     * Verbindung (Kommentarzeilen sähe sie nicht).
     */
    @Scheduled(fixedDelay = HEARTBEAT_MS, initialDelay = HEARTBEAT_MS)
    fun heartbeat() {
        connections.forEach { (userId, list) ->
            list.forEach { send(userId, it, SseEmitter.event().name("ping").data("{}", MediaType.APPLICATION_JSON)) }
        }
    }

    private fun deliver(userId: UUID, event: LiveEvent) {
        val json = objectMapper.writeValueAsString(event)
        connections[userId]?.forEach { emitter ->
            send(userId, emitter, SseEmitter.event().name(event.type).data(json, MediaType.APPLICATION_JSON))
        }
    }

    private fun send(userId: UUID, emitter: SseEmitter, event: SseEmitter.SseEventBuilder) {
        try {
            synchronized(emitter) { emitter.send(event) }
        } catch (ex: IOException) {
            // Verbindung ist weg (App geschlossen, Netz weg).
            remove(userId, emitter)
            runCatching { emitter.completeWithError(ex) }
        } catch (ex: IllegalStateException) {
            // Bereits abgeschlossen.
            remove(userId, emitter)
        } catch (ex: Exception) {
            log.debug("live event not delivered user={}: {}", userId, ex.javaClass.simpleName)
            remove(userId, emitter)
        }
    }

    @PreDestroy
    fun shutdown() {
        executor.shutdownNow()
        connections.values.flatten().forEach { runCatching { it.complete() } }
        connections.clear()
    }

    private fun remove(userId: UUID, emitter: SseEmitter) {
        connections.computeIfPresent(userId) { _, list ->
            list.remove(emitter)
            list.ifEmpty { null }
        }
    }

    companion object {
        const val CONNECTION_TIMEOUT_MS = 10 * 60 * 1000L
        const val HEARTBEAT_MS = 25_000L
        const val RECONNECT_MS = 3_000L
        const val MAX_CONNECTIONS_PER_USER = 8
    }
}
