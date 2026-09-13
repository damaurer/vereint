package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.DrinkSublistService
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
class DrinkSublistControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var drinkSublistService: DrinkSublistService

    private lateinit var mockMvc: MockMvc

    private val sublistId: UUID = UUID.randomUUID()
    private val itemId: UUID = UUID.randomUUID()
    private val drinkId: UUID = UUID.randomUUID()

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return UUID.randomUUID()
    }

    private fun anyCreateRequest(): CreateSublistRequest {
        any(CreateSublistRequest::class.java)
        return CreateSublistRequest()
    }

    private fun anyAddItemRequest(): AddSublistItemRequest {
        any(AddSublistItemRequest::class.java)
        return AddSublistItemRequest()
    }

    private fun sampleSublist() = SublistDto(
        id = sublistId.toString(),
        name = "Standardkarte",
        description = null,
        createdById = UUID.randomUUID().toString(),
        items = emptyList(),
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
    fun `GET sublists returns 401 when unauthenticated`() {
        mockMvc.perform(get("/api/v1/sublists"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `POST sublists creates a sublist and returns 201`() {
        `when`(drinkSublistService.createSublist(anyCreateRequest(), anyPrincipal())).thenReturn(sampleSublist())

        mockMvc.perform(
            post("/api/v1/sublists")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(CreateSublistRequest(name = "Standardkarte")))
                .with(jwt().jwt { it.subject("sub-owner").claim("realm_access", mapOf("roles" to listOf("member"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").value(sublistId.toString()))
            .andExpect(jsonPath("$.name").value("Standardkarte"))
    }

    @Test
    fun `POST sublists rejects a blank name with 400`() {
        mockMvc.perform(
            post("/api/v1/sublists")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"\"}")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
    }

    @Test
    fun `GET sublists returns the visible sublists`() {
        `when`(drinkSublistService.listSublists(anyPrincipal())).thenReturn(
            listOf(
                SublistSummaryDto(
                    id = sublistId.toString(),
                    name = "Standardkarte",
                    description = null,
                    itemCount = 2
                )
            )
        )

        mockMvc.perform(
            get("/api/v1/sublists")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(sublistId.toString()))
            .andExpect(jsonPath("$[0].itemCount").value(2))
    }

    @Test
    fun `GET sublist by id rejects an invalid identifier with 400`() {
        mockMvc.perform(
            get("/api/v1/sublists/not-a-uuid")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("invalid_request"))
    }

    @Test
    fun `POST item adds a drink and returns 201`() {
        `when`(drinkSublistService.addItem(anyUuid(), anyAddItemRequest(), anyPrincipal()))
            .thenReturn(
                SublistItemDto(
                    id = itemId.toString(),
                    drinkId = drinkId.toString(),
                    drinkName = "Club Mate",
                    defaultPrice = BigDecimal("2.00")
                )
            )

        mockMvc.perform(
            post("/api/v1/sublists/$sublistId/items")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(AddSublistItemRequest(drinkId = drinkId.toString())))
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.drinkName").value("Club Mate"))
    }

    @Test
    fun `DELETE sublist returns 204`() {
        mockMvc.perform(
            delete("/api/v1/sublists/$sublistId")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isNoContent)
    }
}
