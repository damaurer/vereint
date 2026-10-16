package de.maurer.baseservice.billing

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Anbindung an Stripe für die Tarife je Stammtisch.
 *
 * Geheimnisse (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) kommen nur aus der
 * Umgebung. Ist [stripeEnabled] `false` oder fehlt ein Geheimnis, antworten
 * Buchung und Zahlungsportal mit `503 billing_unavailable`; Tarife setzt dann
 * nur die Plattform-Administration von Hand.
 */
@ConfigurationProperties(prefix = "vereint.billing")
data class BillingProperties(
    val stripeEnabled: Boolean = false,
    val stripeSecretKey: String = "",
    val stripeWebhookSecret: String = "",
    val stripeApiUrl: String = "https://api.stripe.com",
    /** Öffentliche Adresse der App; Stripe leitet nach Zahlung und Portal dorthin zurück. */
    val appUrl: String = "http://localhost:4200",
    /** Kulanzfrist nach fehlgeschlagener Zahlung, danach nur lesen. */
    val graceDays: Long = 30,
    val timeoutMillis: Long = 10000,
    val prices: Prices = Prices(),
    val amounts: Amounts = Amounts()
) {
    /**
     * Angezeigte Beträge in Cent. Sie müssen zu den Preisen in Stripe passen;
     * abgerechnet wird immer der Preis aus Stripe.
     */
    data class Amounts(
        val stammtischMonth: Int = 400,
        val stammtischYear: Int = 4000,
        val vereinMonth: Int = 900,
        val vereinYear: Int = 9000,
        val supporterMonth: Int = 200
    )

    /** Stripe-Preis-IDs (`price_...`) je Tarif und Zahlweise. */
    data class Prices(
        val stammtischMonth: String = "",
        val stammtischYear: String = "",
        val vereinMonth: String = "",
        val vereinYear: String = "",
        /** Optionaler Förderbeitrag (monatlich), unabhängig vom Tarif. */
        val supporter: String = ""
    )

    val configured: Boolean
        get() = stripeEnabled && stripeSecretKey.isNotBlank() && stripeWebhookSecret.isNotBlank()

    override fun toString(): String =
        "BillingProperties(stripeEnabled=$stripeEnabled, stripeApiUrl=$stripeApiUrl, appUrl=$appUrl, graceDays=$graceDays, prices=$prices, amounts=$amounts)"
}
