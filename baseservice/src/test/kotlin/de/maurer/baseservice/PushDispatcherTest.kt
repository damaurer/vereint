package de.maurer.baseservice

import de.maurer.baseservice.domain.PushSubscriptionEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.push.PushDeliveryResult
import de.maurer.baseservice.push.PushDispatcher
import de.maurer.baseservice.push.PushMessage
import de.maurer.baseservice.push.PushSender
import de.maurer.baseservice.push.PushTarget
import de.maurer.baseservice.repository.PushSubscriptionRepository
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.transaction.support.TransactionSynchronizationUtils
import java.util.UUID
import java.util.concurrent.AbstractExecutorService
import java.util.concurrent.TimeUnit

/**
 * Prüft die Push-Zustellung nach dem Commit und das Aufräumen ungültiger
 * Abonnements (TICKET-020), mit einem synchronen Executor statt Threads.
 */
class PushDispatcherTest {

    private val repository = mock(PushSubscriptionRepository::class.java)
    private val sender = mock(PushSender::class.java)
    private val executor = DirectExecutor()
    private val dispatcher = PushDispatcher(repository, sender, executor)

    private val userId: UUID = UUID.randomUUID()
    private val user = UserEntity(id = userId, keycloakSubject = "sub", displayName = "Mitglied")
    private val message = PushMessage(title = "Hi", body = "Text", type = "general")

    private fun anyTarget(): PushTarget = any(PushTarget::class.java) ?: PushTarget("", "", "", "")
    private fun anyMessage(): PushMessage = any(PushMessage::class.java) ?: message

    @AfterEach
    fun cleanup() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization()
        }
    }

    @Test
    fun `delivers to every subscription and prunes gone ones`() {
        val live = PushSubscriptionEntity(endpoint = "https://push.example/live", p256dh = "a", auth = "b", user = user)
        val gone = PushSubscriptionEntity(endpoint = "https://push.example/gone", p256dh = "a", auth = "b", user = user)
        `when`(repository.findByUserId(userId)).thenReturn(listOf(live, gone))
        `when`(sender.send(anyTarget(), anyMessage())).thenAnswer {
            val target = it.arguments[0] as PushTarget
            if (target.endpoint.endsWith("gone")) {
                PushDeliveryResult(target.subscriptionId, success = false, statusCode = 410, gone = true)
            } else {
                PushDeliveryResult(target.subscriptionId, success = true, statusCode = 201)
            }
        }

        dispatcher.dispatch(listOf(userId), message)

        verify(repository).delete(gone)
        verify(repository, never()).delete(live)
    }

    @Test
    fun `waits for the transaction to commit before sending`() {
        `when`(repository.findByUserId(userId)).thenReturn(emptyList())
        TransactionSynchronizationManager.initSynchronization()

        dispatcher.dispatch(listOf(userId), message)
        assertEquals(0, executor.executed)
        verify(repository, never()).findByUserId(userId)

        TransactionSynchronizationUtils.triggerAfterCommit()
        assertEquals(1, executor.executed)
        verify(repository).findByUserId(userId)
    }

    @Test
    fun `a failing recipient does not stop the others`() {
        val otherId = UUID.randomUUID()
        `when`(repository.findByUserId(userId)).thenThrow(IllegalStateException("db down"))
        `when`(repository.findByUserId(otherId)).thenReturn(emptyList())

        dispatcher.dispatch(listOf(userId, otherId), message)

        verify(repository).findByUserId(otherId)
    }

    private class DirectExecutor : AbstractExecutorService() {
        var executed = 0
        override fun execute(command: Runnable) {
            executed++
            command.run()
        }
        override fun shutdown() = Unit
        override fun shutdownNow(): MutableList<Runnable> = mutableListOf()
        override fun isShutdown() = false
        override fun isTerminated() = false
        override fun awaitTermination(timeout: Long, unit: TimeUnit) = true
    }
}
