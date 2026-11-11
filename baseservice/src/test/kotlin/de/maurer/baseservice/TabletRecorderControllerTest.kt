package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.LedgerEntryDto
import de.maurer.baseservice.dto.TabletEventDto
import de.maurer.baseservice.dto.TabletPurchaseRequest
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.TabletRecorderService
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
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class TabletRecorderControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var tabletRecorderService: TabletRecorderService

    private lateinit var mockMvc: MockMvc

    private val eventId: UUID = UUID.randomUUID()
    private val memberId: UUID = UUID.randomUUID()
    private val eventDrinkId: UUID = UUID.randomUUID()
    private val entryId: UUID = UUID.randomUUID()

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return eventId
    }

    private fun anyRequest(): TabletPurchaseRequest {
        any(TabletPurchaseRequest::class.java)
        return TabletPurchaseRequest()
    }

    private fun anyKey(): String {
        any(String::class.java)
        return "key"
    }

    private fun sampleEntry() = LedgerEntryDto(
        id = entryId.toString(),
        entryType = "purchase",
        eventId = eventId.toString(),
        memberId = memberId.toString(),
        memberDisplayName = "Bob",
        drinkId = UUID.randomUUID().toString(),
        amount = BigDecimal("2.50"),
        currency = "EUR",
        accountingMode = "credit",
        source = "tabletManual",
        actorId = UUID.randomUUID().toString(),
        reversesEntryId = null,
        idempotencyKey = "idem-1",
        createdAt = Instant.now(),
        snapshot = null
    )

    private fun sampleEvent() = TabletEventDto(
        id = eventId.toString(),
        title = "Sommerfest",
        location = "Vereinsheim",
        startsAt = Instant.now(),
        status = "active"
    )

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `POST purchases returns 401 when unauthenticated`() {
        mockMvc.perform(
            post("/api/v1/tablet/events/$eventId/purchases")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "idem-1")
                .content(
                    objectMapper.writeValueAsString(
                        TabletPurchaseRequest(memberId = memberId.toString(), eventDrinkId = eventDrinkId.toString())
                    )
                )
        )
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `POST purchases records a manual purchase and returns 201`() {
        `when`(tabletRecorderService.recordPurchase(anyUuid(), anyRequest(), anyKey(), anyPrincipal()))
            .thenReturn(sampleEntry())

        mockMvc.perform(
            post("/api/v1/tablet/events/$eventId/purchases")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "idem-1")
                .content(
                    objectMapper.writeValueAsString(
                        TabletPurchaseRequest(memberId = memberId.toString(), eventDrinkId = eventDrinkId.toString())
                    )
                )
                .with(jwt().jwt { it.subject("sub-tablet").claim("realm_access", mapOf("roles" to listOf("tabletRecorder"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.entryType").value("purchase"))
            .andExpect(jsonPath("$.source").value("tabletManual"))
    }

    @Test
    fun `POST purchases rejects an empty body with 400`() {
        mockMvc.perform(
            post("/api/v1/tablet/events/$eventId/purchases")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "idem-1")
                .content("{}")
                .with(jwt().jwt { it.subject("sub-tablet") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `the old terminal endpoints for rounds and evenings are gone`() {
        listOf("rounds", "evening").forEach { path ->
            mockMvc.perform(
                post("/api/v1/tablet/events/$eventId/$path")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Idempotency-Key", "round-1")
                    .content("""{"eventDrinkId":"$eventDrinkId","memberIds":["$memberId"]}""")
                    .with(jwt().jwt { it.subject("sub-tablet").claim("realm_access", mapOf("roles" to listOf("tabletRecorder"))) })
            )
                .andExpect(status().isNotFound)
        }
    }

    @Test
    fun `GET events lists active events`() {
        `when`(tabletRecorderService.listActiveEvents(anyPrincipal())).thenReturn(listOf(sampleEvent()))

        mockMvc.perform(
            get("/api/v1/tablet/events")
                .with(jwt().jwt { it.subject("sub-tablet") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(eventId.toString()))
            .andExpect(jsonPath("$[0].status").value("active"))
    }

    @Test
    fun `GET members rejects a syntactically invalid identifier with 400`() {
        mockMvc.perform(
            get("/api/v1/tablet/events/not-a-uuid/members")
                .with(jwt().jwt { it.subject("sub-tablet") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("invalid_request"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `GET items lists tablet drinks and foods`() {
        `when`(tabletRecorderService.listTabletItems(anyUuid(), anyPrincipal())).thenReturn(
            de.maurer.baseservice.dto.TabletItemsDto(
                drinks = emptyList(),
                food = listOf(
                    de.maurer.baseservice.dto.EventFoodDto(
                        id = UUID.randomUUID().toString(),
                        eventId = eventId.toString(),
                        foodId = UUID.randomUUID().toString(),
                        foodName = "Bratwurst",
                        price = BigDecimal("3.50"),
                        effectivePrice = BigDecimal("3.50"),
                        costPrice = BigDecimal("1.50"),
                        effectiveCostPrice = BigDecimal("1.50"),
                        currency = "EUR",
                        selfServiceEnabled = true,
                        tabletEnabled = true,
                        createdAt = Instant.now(),
                        updatedAt = Instant.now()
                    )
                )
            )
        )

        mockMvc.perform(
            get("/api/v1/tablet/events/$eventId/items")
                .with(jwt().jwt { it.subject("sub-tablet") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.food[0].foodName").value("Bratwurst"))
    }
}
