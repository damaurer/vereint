package de.maurer.baseservice.push

import org.slf4j.LoggerFactory

/**
 * Push-Sender ohne tatsächliche Zustellung (TICKET-020).
 *
 * Wird verwendet, wenn kein VAPID-Schlüssel konfiguriert ist (Tests, lokale
 * Läufe). Benachrichtigungen werden weiterhin in `notifications` gespeichert;
 * der eigentliche Versand wird protokolliert, aber übersprungen. So bleibt der
 * fachliche Ablauf ohne externe Abhängigkeit vollständig testbar.
 */
class NoOpPushSender(
    private val configuredPublicKey: String = ""
) : PushSender {

    private val log = LoggerFactory.getLogger(NoOpPushSender::class.java)

    override fun isEnabled(): Boolean = false

    override fun publicKey(): String = configuredPublicKey

    override fun send(target: PushTarget, message: PushMessage): PushDeliveryResult {
        log.debug(
            "push disabled: skipping delivery of type={} to subscription={}",
            message.type,
            target.subscriptionId
        )
        return PushDeliveryResult(subscriptionId = target.subscriptionId, success = true, statusCode = null)
    }
}
