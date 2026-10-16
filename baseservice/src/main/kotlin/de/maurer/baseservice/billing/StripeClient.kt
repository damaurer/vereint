package de.maurer.baseservice.billing

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.Msg
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import java.io.IOException
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration

/**
 * Schmaler Client für die Stripe-REST-API (Checkout und Kundenportal).
 *
 * Bewusst ohne Stripe-SDK: Die App ruft nur zwei Endpunkte auf, Formulardaten
 * über `java.net.http` reichen. Der geheime Schlüssel wird nie geloggt.
 */
class StripeClient(
    private val properties: BillingProperties,
    private val objectMapper: ObjectMapper,
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(properties.timeoutMillis))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build()
) {

    private val log = LoggerFactory.getLogger(StripeClient::class.java)
    private val baseUrl = properties.stripeApiUrl.trimEnd('/')

    /** Legt eine Checkout-Sitzung an und liefert die Zahlungsseite. */
    fun createCheckoutSession(params: List<Pair<String, String>>): String =
        post("/v1/checkout/sessions", params).path("url").asText()

    /** Öffnet das Stripe-Kundenportal (Zahlart, Rechnungen, Tarif kündigen). */
    fun createPortalSession(customerId: String, returnUrl: String): String =
        post("/v1/billing_portal/sessions", listOf("customer" to customerId, "return_url" to returnUrl))
            .path("url").asText()

    private fun post(path: String, params: List<Pair<String, String>>): JsonNode {
        val body = params.joinToString("&") { (key, value) -> "${encode(key)}=${encode(value)}" }
        val request = HttpRequest.newBuilder(URI.create("$baseUrl$path"))
            .timeout(Duration.ofMillis(properties.timeoutMillis))
            .header("Authorization", "Bearer ${properties.stripeSecretKey}")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("Stripe-Version", API_VERSION)
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build()
        val response = try {
            httpClient.send(request, HttpResponse.BodyHandlers.ofString())
        } catch (ex: IOException) {
            log.warn("stripe request failed path={} error={}", path, ex.javaClass.simpleName)
            throw unavailable()
        } catch (ex: InterruptedException) {
            Thread.currentThread().interrupt()
            throw unavailable()
        }
        if (response.statusCode() !in 200..299) {
            // Nur Typ und Code der Stripe-Antwort loggen, keine Kundendaten.
            val error = runCatching { objectMapper.readTree(response.body()).path("error") }.getOrNull()
            log.warn(
                "stripe request rejected path={} status={} type={} code={}",
                path, response.statusCode(), error?.path("type")?.asText(), error?.path("code")?.asText()
            )
            throw unavailable()
        }
        return objectMapper.readTree(response.body())
    }

    private fun encode(value: String) = URLEncoder.encode(value, StandardCharsets.UTF_8)

    private fun unavailable() =
        ApiException(ErrorCode.BILLING_UNAVAILABLE, Msg("error.billing.unavailable"), HttpStatus.SERVICE_UNAVAILABLE)

    companion object {
        /** Feste API-Version, damit sich Webhook-Inhalte nicht unbemerkt ändern. */
        const val API_VERSION = "2025-03-31.basil"
    }
}
