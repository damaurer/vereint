package de.maurer.baseservice.identity

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.error.EmailAlreadyRegisteredException
import de.maurer.baseservice.error.PasswordRejectedException
import de.maurer.baseservice.error.RegistrationUnavailableException
import org.slf4j.LoggerFactory
import java.io.IOException
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration

/**
 * Legt Konten über die Keycloak-Admin-REST-API an.
 *
 * Für jeden Aufruf holt der Client per Client Credentials ein kurzlebiges Token
 * des Service-Accounts `vereint-registration`. Registrierungen sind selten, ein
 * Token-Cache lohnt sich daher nicht. Passwort und Tokens werden nie geloggt.
 */
class KeycloakIdentityProvisioner(
    private val properties: RegistrationProperties,
    private val objectMapper: ObjectMapper,
    private val httpClient: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(properties.timeoutMillis))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build()
) : IdentityProvisioner {

    private val log = LoggerFactory.getLogger(KeycloakIdentityProvisioner::class.java)

    private val baseUrl = properties.keycloakUrl.trimEnd('/')
    private val realm = URLEncoder.encode(properties.realm, StandardCharsets.UTF_8)

    override fun createAccount(account: NewAccount): String {
        val token = accessToken()
        val body = objectMapper.writeValueAsString(
            mapOf(
                "username" to account.email,
                "email" to account.email,
                "firstName" to account.firstName,
                "lastName" to account.lastName,
                "enabled" to true,
                "emailVerified" to false,
                "credentials" to listOf(
                    mapOf("type" to "password", "value" to account.password, "temporary" to false)
                )
            )
        )
        val response = send(
            HttpRequest.newBuilder(URI.create("$baseUrl/admin/realms/$realm/users"))
                .header("Authorization", "Bearer $token")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
        )

        when (response.statusCode()) {
            201 -> {
                val location = response.headers().firstValue("Location").orElse("")
                val subject = location.substringAfterLast('/', "")
                if (subject.isBlank()) {
                    log.error("registration keycloak_create_user missing_location")
                    throw RegistrationUnavailableException("Keycloak hat keine Benutzer-ID geliefert")
                }
                return subject
            }
            409 -> throw EmailAlreadyRegisteredException(
                "Für diese E-Mail-Adresse gibt es bereits ein Konto. Bitte melde dich an oder setze dein Passwort zurück."
            )
            400 -> {
                // Keycloak liefert bei verletzter Passwortrichtlinie einen
                // `errorMessage`-Schlüssel wie `invalidPasswordMinLengthMessage`.
                val error = errorMessage(response.body())
                log.warn("registration keycloak_create_user status=400 error={}", error)
                if (error.contains("password", ignoreCase = true)) {
                    throw PasswordRejectedException("Das Passwort erfüllt die Vorgaben nicht")
                }
                throw RegistrationUnavailableException("Keycloak hat die Registrierung abgelehnt")
            }
            else -> {
                log.error("registration keycloak_create_user status={}", response.statusCode())
                throw RegistrationUnavailableException()
            }
        }
    }

    override fun deleteAccount(subject: String) {
        val token = accessToken()
        val id = URLEncoder.encode(subject, StandardCharsets.UTF_8)
        val response = send(
            HttpRequest.newBuilder(URI.create("$baseUrl/admin/realms/$realm/users/$id"))
                .header("Authorization", "Bearer $token")
                .DELETE()
        )
        if (response.statusCode() !in 200..299 && response.statusCode() != 404) {
            log.error("registration keycloak_delete_user status={} subject={}", response.statusCode(), subject)
            throw RegistrationUnavailableException()
        }
    }

    private fun accessToken(): String {
        val form = listOf(
            "grant_type" to "client_credentials",
            "client_id" to properties.clientId,
            "client_secret" to properties.clientSecret
        ).joinToString("&") { (k, v) ->
            "${URLEncoder.encode(k, StandardCharsets.UTF_8)}=${URLEncoder.encode(v, StandardCharsets.UTF_8)}"
        }
        val response = send(
            HttpRequest.newBuilder(URI.create("$baseUrl/realms/$realm/protocol/openid-connect/token"))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
        )
        if (response.statusCode() != 200) {
            log.error("registration keycloak_token status={}", response.statusCode())
            throw RegistrationUnavailableException()
        }
        val token = objectMapper.readTree(response.body()).path("access_token").asText("")
        if (token.isBlank()) {
            log.error("registration keycloak_token missing_access_token")
            throw RegistrationUnavailableException()
        }
        return token
    }

    private fun send(builder: HttpRequest.Builder): HttpResponse<String> = try {
        httpClient.send(
            builder.timeout(Duration.ofMillis(properties.timeoutMillis)).build(),
            HttpResponse.BodyHandlers.ofString()
        )
    } catch (ex: IOException) {
        log.error("registration keycloak_unreachable error={}", ex.javaClass.simpleName)
        throw RegistrationUnavailableException()
    } catch (ex: InterruptedException) {
        Thread.currentThread().interrupt()
        throw RegistrationUnavailableException()
    }

    private fun errorMessage(body: String?): String = try {
        if (body.isNullOrBlank()) "" else objectMapper.readTree(body).path("errorMessage").asText("")
    } catch (_: Exception) {
        ""
    }
}

/** Ersatz, solange die Registrierung nicht konfiguriert ist. */
class DisabledIdentityProvisioner : IdentityProvisioner {
    override fun createAccount(account: NewAccount): String =
        throw RegistrationUnavailableException("Die Registrierung ist auf diesem Server nicht eingerichtet")

    override fun deleteAccount(subject: String) = Unit
}
