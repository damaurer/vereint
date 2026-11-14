package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.CreateFoodRequest
import de.maurer.baseservice.dto.FoodDto
import de.maurer.baseservice.dto.FoodSummaryDto
import de.maurer.baseservice.dto.UpdateFoodRequest
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.FoodCatalogService
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
class FoodCatalogControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var foodCatalogService: FoodCatalogService

    private lateinit var mockMvc: MockMvc

    private val foodId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    private fun anyUuid(): UUID = any(UUID::class.java) ?: foodId
    private fun anyPrincipal(): UserPrincipal = any(UserPrincipal::class.java) ?: UserPrincipal("sub")
    private fun anyCreateFoodRequest(): CreateFoodRequest = any(CreateFoodRequest::class.java) ?: CreateFoodRequest()
    private fun anyUpdateFoodRequest(): UpdateFoodRequest = any(UpdateFoodRequest::class.java) ?: UpdateFoodRequest()

    private fun sampleFood(): FoodDto =
        FoodDto(
            id = foodId.toString(),
            name = "Bratwurst",
            description = "Lecker vom Grill",
            category = "Grill",
            defaultPrice = BigDecimal("3.50"),
            costPrice = BigDecimal("1.50"),
            currency = "EUR",
            active = true,
            createdById = UUID.randomUUID().toString(),
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )

    @Test
    fun `GET list foods returns 200`() {
        `when`(foodCatalogService.listFoods(anyPrincipal(), any())).thenReturn(
            listOf(
                FoodSummaryDto(
                    id = foodId.toString(),
                    name = "Bratwurst",
                    category = "Grill",
                    defaultPrice = BigDecimal("3.50"),
                    costPrice = BigDecimal("1.50"),
                    currency = "EUR",
                    active = true
                )
            )
        )

        mockMvc.perform(
            get("/api/v1/food")
                .with(jwt().jwt { it.subject("sub-1") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].name").value("Bratwurst"))
            .andExpect(jsonPath("$[0].defaultPrice").value(3.50))
            .andExpect(jsonPath("$[0].costPrice").value(1.50))
    }

    @Test
    fun `GET food by id returns 200`() {
        `when`(foodCatalogService.getFood(anyUuid(), anyPrincipal())).thenReturn(sampleFood())

        mockMvc.perform(
            get("/api/v1/food/$foodId")
                .with(jwt().jwt { it.subject("sub-1") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.name").value("Bratwurst"))
            .andExpect(jsonPath("$.costPrice").value(1.50))
    }

    @Test
    fun `POST create food returns 201`() {
        `when`(foodCatalogService.createFood(anyCreateFoodRequest(), anyPrincipal())).thenReturn(sampleFood())

        val request = CreateFoodRequest(
            name = "Bratwurst",
            defaultPrice = BigDecimal("3.50"),
            costPrice = BigDecimal("1.50")
        )

        mockMvc.perform(
            post("/api/v1/food")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(jwt().jwt { it.subject("sub-board") })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.name").value("Bratwurst"))
    }

    @Test
    fun `PUT update food returns 200`() {
        `when`(foodCatalogService.updateFood(anyUuid(), anyUpdateFoodRequest(), anyPrincipal())).thenReturn(sampleFood())

        val request = UpdateFoodRequest(defaultPrice = BigDecimal("4.00"))

        mockMvc.perform(
            put("/api/v1/food/$foodId")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(jwt().jwt { it.subject("sub-board") })
        )
            .andExpect(status().isOk)
    }
}
