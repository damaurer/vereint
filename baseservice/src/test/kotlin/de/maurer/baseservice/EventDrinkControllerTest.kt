package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.EventDrinkService
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
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class EventDrinkControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var eventDrinkService: EventDrinkService

    private lateinit var mockMvc: MockMvc

    private val eventId: UUID = UUID.randomUUID()
    private val eventDrinkId: UUID = UUID.randomUUID()
    private val drinkId: UUID = UUID.randomUUID()
    private val sublistId: UUID = UUID.randomUUID()

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return UUID.randomUUID()
    }

    private fun anyAddRequest(): AddEventDrinkRequest {
        any(AddEventDrinkRequest::class.java)
        return AddEventDrinkRequest()
    }

    private fun anyAssignRequest(): AssignSublistRequest {
        any(AssignSublistRequest::class.java)
        return AssignSublistRequest()
    }

    private fun sampleEventDrink() = EventDrinkDto(
        id = eventDrinkId.toString(),
        eventId = eventId.toString(),
        drinkId = drinkId.toString(),
        drinkName = "Club Mate",
        price = BigDecimal("2.50"),
        currency = "EUR",
        selfServiceEnabled = true,
        tabletEnabled = true,
        catalogVersion = 3,
        imageSnapshot = "s3://drinks/mate.png",
        createdAt = Instant.now(),
        updatedAt = Instant.now()
    )

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `GET event drinks returns 401 when unauthenticated`() {
        mockMvc.perform(get("/api/v1/events/$eventId/drinks"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GET event drinks returns the selection`() {
        `when`(eventDrinkService.listEventDrinks(anyUuid(), anyPrincipal())).thenReturn(listOf(sampleEventDrink()))

        mockMvc.perform(
            get("/api/v1/events/$eventId/drinks")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(eventDrinkId.toString()))
            .andExpect(jsonPath("$[0].catalogVersion").value(3))
    }

    @Test
    fun `POST event drink adds a copy and returns 201`() {
        `when`(eventDrinkService.addEventDrink(anyUuid(), anyAddRequest(), anyPrincipal())).thenReturn(sampleEventDrink())

        mockMvc.perform(
            post("/api/v1/events/$eventId/drinks")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(AddEventDrinkRequest(drinkId = drinkId.toString())))
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.drinkName").value("Club Mate"))
            .andExpect(jsonPath("$.imageSnapshot").value("s3://drinks/mate.png"))
    }

    @Test
    fun `POST event drink rejects a blank drinkId with 400`() {
        mockMvc.perform(
            post("/api/v1/events/$eventId/drinks")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"drinkId\":\"\"}")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
    }

    @Test
    fun `POST assign-sublist returns the merged selection`() {
        `when`(eventDrinkService.assignSublist(anyUuid(), anyAssignRequest(), anyPrincipal()))
            .thenReturn(listOf(sampleEventDrink()))

        mockMvc.perform(
            post("/api/v1/events/$eventId/drinks/assign-sublist")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(AssignSublistRequest(sublistId = sublistId.toString())))
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].drinkId").value(drinkId.toString()))
    }

    @Test
    fun `DELETE event drink returns 204`() {
        mockMvc.perform(
            delete("/api/v1/events/$eventId/drinks/$eventDrinkId")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isNoContent)
    }

    @Test
    fun `GET event drinks rejects an invalid event identifier with 400`() {
        mockMvc.perform(
            get("/api/v1/events/not-a-uuid/drinks")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("invalid_request"))
    }
}
