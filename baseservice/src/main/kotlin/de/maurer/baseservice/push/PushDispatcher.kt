package de.maurer.baseservice.push

import de.maurer.baseservice.repository.PushSubscriptionRepository
import jakarta.annotation.PreDestroy
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Stellt Web-Push-Nachrichten im Hintergrund zu (TICKET-020).
 *
 * Der Versand startet erst nach dem Commit der auslösenden Transaktion. So hält
 * ein langsamer Push-Dienst keine Datenbanktransaktion offen, und der Service
 * Worker findet die Benachrichtigung bereits vor, wenn er sie nach dem Push
 * nachlädt. Dauerhaft ungültige Abonnements (`404`/`410`) werden entfernt.
 */
@Component
class PushDispatcher internal constructor(
    private val pushSubscriptionRepository: PushSubscriptionRepository,
    private val pushSender: PushSender,
    private val executor: ExecutorService
) {

    @Autowired
    constructor(
        pushSubscriptionRepository: PushSubscriptionRepository,
        pushSender: PushSender
    ) : this(
        pushSubscriptionRepository,
        pushSender,
        Executors.newFixedThreadPool(2) { runnable ->
            Thread(runnable, "push-dispatch").apply { isDaemon = true }
        }
    )

    private val log = LoggerFactory.getLogger(PushDispatcher::class.java)

    /** Plant die Zustellung von [message] an alle Abonnements der [userIds]. */
    fun dispatch(userIds: Collection<UUID>, message: PushMessage) {
        if (userIds.isEmpty()) return
        val recipients = userIds.toList()
        val task = Runnable { recipients.forEach { deliverSafely(it, message) } }

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() = executor.execute(task)
            })
        } else {
            executor.execute(task)
        }
    }

    private fun deliverSafely(userId: UUID, message: PushMessage) {
        try {
            deliver(userId, message)
        } catch (ex: Exception) {
            log.warn("push dispatch failed user={}: {}", userId, ex.javaClass.simpleName)
        }
    }

    /** Liefert die Anzahl erfolgreicher Zustellungen an [userId]. */
    internal fun deliver(userId: UUID, message: PushMessage): Int {
        var delivered = 0
        pushSubscriptionRepository.findByUserId(userId).forEach { subscription ->
            val result = pushSender.send(
                PushTarget(
                    subscriptionId = subscription.id.toString(),
                    endpoint = subscription.endpoint,
                    p256dh = subscription.p256dh,
                    auth = subscription.auth
                ),
                message
            )
            when {
                result.success -> delivered++
                result.gone -> {
                    pushSubscriptionRepository.delete(subscription)
                    log.info("removed gone push subscription={} user={}", subscription.id, userId)
                }
                else -> log.warn(
                    "push not delivered subscription={} status={} error={}",
                    subscription.id,
                    result.statusCode,
                    result.error
                )
            }
        }
        return delivered
    }

    @PreDestroy
    fun shutdown() {
        executor.shutdown()
        executor.awaitTermination(10, TimeUnit.SECONDS)
    }
}
