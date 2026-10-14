package de.maurer.baseservice

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import de.maurer.baseservice.error.EmailAlreadyRegisteredException
import de.maurer.baseservice.error.PasswordRejectedException
import de.maurer.baseservice.error.RegistrationUnavailableException
import de.maurer.baseservice.identity.KeycloakIdentityProvisioner
import de.maurer.baseservice.identity.NewAccount
import de.maurer.baseservice.identity.RegistrationProperties
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.net.http.HttpClient
import java.util.concurrent.CopyOnWriteArrayList

/** Prüft die Aufrufe an die Keycloak-Admin-API gegen einen lokalen Fake-Server. */
class KeycloakIdentityProvisionerTest {

    private data class Recorded(val method: String, val path: String, val headers: Map<String, String>, val body: String)

    private val objectMapper = jacksonObjectMapper()
    private val requests = CopyOnWriteArrayList<Recorded>()
    private lateinit var server: HttpServer
    private var createStatus = 201
    private var createBody = ""
    private var tokenStatus = 200

    private val account = NewAccount("anna@example.org", "Anna", "Neumann", "sehr-geheimes-passwort")

    @BeforeEach
    fun start() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange -> handle(exchange) }
        server.start()
    }

    @AfterEach
    fun stop() = server.stop(0)

    private fun handle(exchange: HttpExchange) {
        val body = exchange.requestBody.readAllBytes().toString(Charsets.UTF_8)
        val headers = exchange.requestHeaders.mapValues { it.value.first() }.mapKeys { it.key.lowercase() }
        requests += Recorded(exchange.requestMethod, exchange.requestURI.path, headers, body)
        val path = exchange.requestURI.path
        when {
            path == "/kc/realms/vereint/protocol/openid-connect/token" ->
                respond(exchange, tokenStatus, "{\"access_token\":\"admin-token\"}")
            path == "/kc/admin/realms/vereint/users" && exchange.requestMethod == "POST" -> {
                if (createStatus == 201) {
                    exchange.responseHeaders.add("Location", "http://kc/admin/realms/vereint/users/1234-abcd")
                }
                respond(exchange, createStatus, createBody)
            }
            path == "/kc/admin/realms/vereint/users/1234-abcd" && exchange.requestMethod == "DELETE" ->
                respond(exchange, 204, "")
            else -> respond(exchange, 404, "")
        }
    }

    private fun respond(exchange: HttpExchange, status: Int, body: String) {
        val bytes = body.toByteArray()
        exchange.sendResponseHeaders(status, if (bytes.isEmpty()) -1 else bytes.size.toLong())
        if (bytes.isNotEmpty()) exchange.responseBody.use { it.write(bytes) }
        exchange.close()
    }

    private fun provisioner() = KeycloakIdentityProvisioner(
        RegistrationProperties(
            enabled = true,
            keycloakUrl = "http://127.0.0.1:${server.address.port}/kc/",
            clientSecret = "registration-secret"
        ),
        objectMapper,
        HttpClient.newBuilder().proxy(HttpClient.Builder.NO_PROXY).build()
    )

    @Test
    fun `creates an enabled account with a permanent password and no role mappings`() {
        val subject = provisioner().createAccount(account)

        assertEquals("1234-abcd", subject)
        val token = requests.first()
        assertTrue(token.body.contains("grant_type=client_credentials"))
        assertTrue(token.body.contains("client_id=vereint-registration"))
        assertTrue(token.body.contains("client_secret=registration-secret"))

        val create = requests.single { it.path.endsWith("/users") }
        assertEquals("Bearer admin-token", create.headers["authorization"])
        val json = objectMapper.readTree(create.body)
        assertEquals("anna@example.org", json["username"].asText())
        assertEquals("anna@example.org", json["email"].asText())
        assertTrue(json["enabled"].asBoolean())
        assertEquals("password", json["credentials"][0]["type"].asText())
        assertFalse(json["credentials"][0]["temporary"].asBoolean())
        assertNull(json["realmRoles"])
        assertNull(json["clientRoles"])
        assertNull(json["groups"])
    }

    @Test
    fun `maps keycloak conflicts and password policy errors`() {
        createStatus = 409
        assertThrows(EmailAlreadyRegisteredException::class.java) { provisioner().createAccount(account) }

        createStatus = 400
        createBody = "{\"errorMessage\":\"invalidPasswordMinLengthMessage\"}"
        assertThrows(PasswordRejectedException::class.java) { provisioner().createAccount(account) }
    }

    @Test
    fun `an invalid client secret makes registration unavailable`() {
        tokenStatus = 401
        assertThrows(RegistrationUnavailableException::class.java) { provisioner().createAccount(account) }
        assertTrue(requests.none { it.path.endsWith("/users") })
    }

    @Test
    fun `deletes an account`() {
        provisioner().deleteAccount("1234-abcd")
        assertTrue(requests.any { it.method == "DELETE" && it.path.endsWith("/users/1234-abcd") })
    }

    @Test
    fun `the password never appears in toString`() {
        assertFalse(account.toString().contains(account.password))
    }
}
