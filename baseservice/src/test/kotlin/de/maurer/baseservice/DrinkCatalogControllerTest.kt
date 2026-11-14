package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.DrinkCatalogService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
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
class DrinkCatalogControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var drinkCatalogService: DrinkCatalogService

    private lateinit var mockMvc: MockMvc

    private val drinkId: UUID = UUID.randomUUID()
    private val barcodeId: UUID = UUID.randomUUID()
    private val proposerId: UUID = UUID.randomUUID()

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return UUID.randomUUID()
    }

    private fun anyProposeRequest(): ProposeDrinkRequest {
        any(ProposeDrinkRequest::class.java)
        return ProposeDrinkRequest()
    }

    private fun anyUpdateRequest(): UpdateDrinkRequest {
        any(UpdateDrinkRequest::class.java)
        return UpdateDrinkRequest()
    }

    private fun anyAddBarcodeRequest(): AddBarcodeRequest {
        any(AddBarcodeRequest::class.java)
        return AddBarcodeRequest()
    }

    private fun sampleDrink(status: String = "proposed") = DrinkDto(
        id = drinkId.toString(),
        name = "Club Mate",
        description = null,
        category = "Erfrischung",
        defaultPrice = BigDecimal("2.50"),
        currency = "EUR",
        imageReference = null,
        catalogVersion = 1,
        status = status,
        active = status == "approved",
        proposedById = proposerId.toString(),
        approvedById = null,
        barcodes = emptyList(),
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
    fun `POST drinks returns 401 when unauthenticated`() {
        mockMvc.perform(
            post("/api/v1/drinks")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(ProposeDrinkRequest(name = "X", defaultPrice = BigDecimal.ONE)))
        )
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `POST drinks proposes a drink and returns 201`() {
        `when`(drinkCatalogService.proposeDrink(anyProposeRequest(), anyPrincipal())).thenReturn(sampleDrink())

        mockMvc.perform(
            post("/api/v1/drinks")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(ProposeDrinkRequest(name = "Club Mate", defaultPrice = BigDecimal("2.50"))))
                .with(jwt().jwt { it.subject("sub-proposer").claim("realm_access", mapOf("roles" to listOf("member"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").value(drinkId.toString()))
            .andExpect(jsonPath("$.status").value("proposed"))
    }

    @Test
    fun `POST drinks rejects a blank name with 400`() {
        mockMvc.perform(
            post("/api/v1/drinks")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"\",\"defaultPrice\":2.50}")
                .with(jwt().jwt { it.subject("sub-proposer") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `GET drinks returns the visible catalog`() {
        `when`(drinkCatalogService.listDrinks(anyPrincipal(), any())).thenReturn(
            listOf(
                DrinkSummaryDto(
                    id = drinkId.toString(),
                    name = "Club Mate",
                    category = "Erfrischung",
                    defaultPrice = BigDecimal("2.50"),
                    currency = "EUR",
                    status = "approved",
                    active = true,
                    catalogVersion = 1
                )
            )
        )

        mockMvc.perform(
            get("/api/v1/drinks")
                .with(jwt().jwt { it.subject("sub-member") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(drinkId.toString()))
            .andExpect(jsonPath("$[0].name").value("Club Mate"))
    }

    @Test
    fun `GET drink by id returns the drink`() {
        `when`(drinkCatalogService.getDrink(anyUuid(), anyPrincipal())).thenReturn(sampleDrink("approved"))

        mockMvc.perform(
            get("/api/v1/drinks/$drinkId")
                .with(jwt().jwt { it.subject("sub-member") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(drinkId.toString()))
            .andExpect(jsonPath("$.status").value("approved"))
    }

    @Test
    fun `GET drink by id rejects a syntactically invalid identifier with 400`() {
        mockMvc.perform(
            get("/api/v1/drinks/not-a-uuid")
                .with(jwt().jwt { it.subject("sub-member") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("invalid_request"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `GET drink by barcode returns the drink`() {
        `when`(drinkCatalogService.getDrinkByBarcode(anyString(), anyPrincipal())).thenReturn(sampleDrink("approved"))

        mockMvc.perform(
            get("/api/v1/drinks/barcode/4029764001807")
                .with(jwt().jwt { it.subject("sub-member") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(drinkId.toString()))
    }

    @Test
    fun `PUT drink updates the drink`() {
        `when`(drinkCatalogService.updateDrink(anyUuid(), anyUpdateRequest(), anyPrincipal()))
            .thenReturn(sampleDrink("approved").copy(name = "Mate Neu", catalogVersion = 2))

        mockMvc.perform(
            put("/api/v1/drinks/$drinkId")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(UpdateDrinkRequest(name = "Mate Neu")))
                .with(jwt().jwt { it.subject("sub-board") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.name").value("Mate Neu"))
            .andExpect(jsonPath("$.catalogVersion").value(2))
    }

    @Test
    fun `POST approve returns the approved drink`() {
        `when`(drinkCatalogService.approveDrink(anyUuid(), anyPrincipal())).thenReturn(sampleDrink("approved"))

        mockMvc.perform(
            post("/api/v1/drinks/$drinkId/approve")
                .with(jwt().jwt { it.subject("sub-board") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("approved"))
    }

    @Test
    fun `POST reject returns the rejected drink`() {
        `when`(drinkCatalogService.rejectDrink(anyUuid(), anyPrincipal())).thenReturn(sampleDrink("rejected"))

        mockMvc.perform(
            post("/api/v1/drinks/$drinkId/reject")
                .with(jwt().jwt { it.subject("sub-board") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("rejected"))
    }

    @Test
    fun `POST barcode adds a barcode and returns 201`() {
        `when`(drinkCatalogService.addBarcode(anyUuid(), anyAddBarcodeRequest(), anyPrincipal())).thenReturn(
            DrinkBarcodeDto(id = barcodeId.toString(), barcode = "4029764001807", active = true)
        )

        mockMvc.perform(
            post("/api/v1/drinks/$drinkId/barcodes")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(AddBarcodeRequest(barcode = "4029764001807")))
                .with(jwt().jwt { it.subject("sub-board") })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.barcode").value("4029764001807"))
    }

    @Test
    fun `DELETE barcode returns 204`() {
        mockMvc.perform(
            delete("/api/v1/drinks/$drinkId/barcodes/$barcodeId")
                .with(jwt().jwt { it.subject("sub-board") })
        )
            .andExpect(status().isNoContent)
    }
}
