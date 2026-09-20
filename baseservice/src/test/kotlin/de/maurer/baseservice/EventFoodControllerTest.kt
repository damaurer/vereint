package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.AddEventFoodRequest
import de.maurer.baseservice.dto.EventFoodDto
import de.maurer.baseservice.dto.UpdateEventFoodRequest
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.EventFoodService
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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class EventFoodControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var eventFoodService: EventFoodService

    private lateinit var mockMvc: MockMvc

    private val eventId: UUID = UUID.randomUUID()
    private val eventFoodId: UUID = UUID.randomUUID()
    private val foodId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    private fun anyUuid(): UUID = any(UUID::class.java) ?: eventId
    private fun anyPrincipal(): UserPrincipal = any(UserPrincipal::class.java) ?: UserPrincipal("sub")
    private fun anyAddEventFoodRequest(): AddEventFoodRequest = any(AddEventFoodRequest::class.java) ?: AddEventFoodRequest()
    private fun anyUpdateEventFoodRequest(): UpdateEventFoodRequest = any(UpdateEventFoodRequest::class.java) ?: UpdateEventFoodRequest()

    private fun sampleEventFood(): EventFoodDto =
        EventFoodDto(
            id = eventFoodId.toString(),
            eventId = eventId.toString(),
            foodId = foodId.toString(),
            foodName = "Pommes",
            price = BigDecimal("3.50"),
            effectivePrice = BigDecimal("3.50"),
            costPrice = BigDecimal("1.20"),
            effectiveCostPrice = BigDecimal("1.20"),
            currency = "EUR",
            selfServiceEnabled = true,
            tabletEnabled = true,
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )

    @Test
    fun `GET event food list returns 200`() {
        `when`(eventFoodService.listEventFood(anyUuid(), anyPrincipal())).thenReturn(listOf(sampleEventFood()))

        mockMvc.perform(
            get("/api/v1/events/$eventId/food")
                .with(jwt().jwt { it.subject("sub-1") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].foodName").value("Pommes"))
            .andExpect(jsonPath("$[0].effectivePrice").value(3.50))
            .andExpect(jsonPath("$[0].effectiveCostPrice").value(1.20))
    }

    @Test
    fun `POST add event food returns 201`() {
        `when`(eventFoodService.addEventFood(anyUuid(), anyAddEventFoodRequest(), anyPrincipal())).thenReturn(sampleEventFood())

        val request = AddEventFoodRequest(foodId = foodId.toString(), price = BigDecimal("3.50"))

        mockMvc.perform(
            post("/api/v1/events/$eventId/food")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.foodName").value("Pommes"))
    }

    @Test
    fun `PUT update event food returns 200`() {
        `when`(eventFoodService.updateEventFood(anyUuid(), anyUuid(), anyUpdateEventFoodRequest(), anyPrincipal())).thenReturn(sampleEventFood())

        val request = UpdateEventFoodRequest(price = BigDecimal("4.00"))

        mockMvc.perform(
            put("/api/v1/events/$eventId/food/$eventFoodId")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
    }

    @Test
    fun `DELETE remove event food returns 204`() {
        mockMvc.perform(
            delete("/api/v1/events/$eventId/food/$eventFoodId")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isNoContent)
    }
}
