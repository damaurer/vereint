package de.maurer.baseservice.push

/**
 * Ein zuzustellendes Push-Abonnement (Browser-`PushSubscription`).
 */
data class PushTarget(
    val subscriptionId: String,
    val endpoint: String,
    val p256dh: String,
    val auth: String
)

/**
 * Inhalt einer Push-Benachrichtigung.
 *
 * Der Inhalt reist Ende-zu-Ende-verschlüsselt (RFC 8291) zum Gerät: Der
 * Push-Dienst von Google, Apple oder Mozilla sieht nur Chiffretext. Der Service
 * Worker zeigt die Benachrichtigung damit sofort an, auch wenn die Sitzung im
 * Browser abgelaufen ist oder das Netz langsam ist, und kennt das Klickziel.
 *
 * - [link]: app-interner Pfad, den ein Tipp auf die Benachrichtigung öffnet
 * - [stammtischId]: Gruppe des Eintrags; der Service Worker wählt sie vor dem Öffnen
 * - [tag]: gleiche Tags ersetzen einander (z. B. je Chat eine Benachrichtigung)
 * - [notificationId]: gespeicherte Mitteilung, etwa zum Beantworten einer Einladung
 */
data class PushMessage(
    val title: String,
    val body: String,
    val type: String,
    val link: String? = null,
    val stammtischId: String? = null,
    val tag: String? = null,
    val notificationId: String? = null
)

/**
 * Ergebnis eines einzelnen Zustellversuchs.
 *
 * `gone` signalisiert ein dauerhaft ungültiges Abonnement (HTTP `404`/`410`);
 * der aufrufende Dienst entfernt es daraufhin (`deny by default` bleibt
 * unberührt, da der Empfänger sich neu abonnieren muss).
 */
data class PushDeliveryResult(
    val subscriptionId: String,
    val success: Boolean,
    val statusCode: Int? = null,
    val gone: Boolean = false,
    val error: String? = null
)

/**
 * Abstraktion des Web-Push-Versands (TICKET-020).
 *
 * Die konkrete Anbindung wird über [de.maurer.baseservice.config.PushConfig]
 * gewählt: der echte VAPID-Sender im Betrieb, ansonsten ein No-Op-Sender für
 * Tests und lokale Läufe ohne VAPID-Schlüssel.
 */
interface PushSender {

    /** Ist der tatsächliche Versand aktiv und vollständig konfiguriert? */
    fun isEnabled(): Boolean

    /** Öffentlicher VAPID-Schlüssel für den Browser (leer, wenn nicht konfiguriert). */
    fun publicKey(): String

    /** Stellt [message] an ein einzelnes [target] zu. */
    fun send(target: PushTarget, message: PushMessage): PushDeliveryResult
}
