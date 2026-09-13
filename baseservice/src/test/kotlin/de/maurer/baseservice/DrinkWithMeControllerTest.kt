package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.DrinkWithMeSessionDto
import de.maurer.baseservice.dto.StartDrinkWithMeRequest
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.DrinkWithMeService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class DrinkWithMeControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var drinkWithMeService: DrinkWithMeService

    private lateinit var mockMvc: MockMvc

    private val eventId: UUID = UUID.randomUUID()
    private val sessionId: UUID = UUID.randomUUID()
    private val userId: UUID = UUID.randomUUID()

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return UUID.randomUUID()
    }

    private fun anyRequest(): StartDrinkWithMeRequest {
        any(StartDrinkWithMeRequest::class.java)
        return StartDrinkWithMeRequest()
    }

    private fun sampleSession(active: Boolean = true) = DrinkWithMeSessionDto(
        id = sessionId.toString(),
        eventId = eventId.toString(),
        userId = userId.toString(),
        userName = "Owner",
        latitude = 50.0,
        longitude = 8.0,
        message = "Trink mit mir",
        active = active,
        expiresAt = Instant.now().plusSeconds(3600),
        createdAt = Instant.now()
    )

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `POST returns 401 when unauthenticated`() {
        mockMvc.perform(
            post("/api/v1/events/$eventId/drink-with-me")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(StartDrinkWithMeRequest(consent = true, durationMinutes = 60)))
        )
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `POST starts a session and returns 201`() {
        `when`(drinkWithMeService.startSession(anyUuid(), anyRequest(), anyPrincipal()))
            .thenReturn(sampleSession())

        mockMvc.perform(
            post("/api/v1/events/$eventId/drink-with-me")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(StartDrinkWithMeRequest(consent = true, durationMinutes = 60)))
                .with(jwt().jwt { it.subject("sub-owner").claim("realm_access", mapOf("roles" to listOf("member"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.active").value(true))
            .andExpect(jsonPath("$.userName").value("Owner"))
    }

    @Test
    fun `POST rejects an out-of-range duration with 400`() {
        mockMvc.perform(
            post("/api/v1/events/$eventId/drink-with-me")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"consent\":true,\"durationMinutes\":100000}")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `GET returns the active sessions`() {
        `when`(drinkWithMeService.listActiveSessions(anyUuid(), anyPrincipal()))
            .thenReturn(listOf(sampleSession()))

        mockMvc.perform(
            get("/api/v1/events/$eventId/drink-with-me")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(sessionId.toString()))
    }

    @Test
    fun `GET rejects an invalid identifier with 400`() {
        mockMvc.perform(
            get("/api/v1/events/not-a-uuid/drink-with-me")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("invalid_request"))
    }

    @Test
    fun `DELETE revokes a session and returns 200`() {
        `when`(drinkWithMeService.revokeSession(anyUuid(), anyUuid(), anyPrincipal()))
            .thenReturn(sampleSession(active = false))

        mockMvc.perform(
            delete("/api/v1/events/$eventId/drink-with-me/$sessionId")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.active").value(false))
    }
}
