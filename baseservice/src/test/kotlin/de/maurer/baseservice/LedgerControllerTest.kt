package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.CorrectionRequest
import de.maurer.baseservice.dto.LedgerEntryDto
import de.maurer.baseservice.dto.MemberBalanceDto
import de.maurer.baseservice.dto.PayoutRequest
import de.maurer.baseservice.dto.PurchaseRequest
import de.maurer.baseservice.dto.TopupRequest
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.LedgerService
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
class LedgerControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var ledgerService: LedgerService

    private lateinit var mockMvc: MockMvc

    private val entryId: UUID = UUID.randomUUID()
    private val memberId: UUID = UUID.randomUUID()

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyKey(): String {
        any(String::class.java)
        return "key"
    }

    private fun anyTopup(): TopupRequest {
        any(TopupRequest::class.java)
        return TopupRequest()
    }

    private fun anyPayout(): PayoutRequest {
        any(PayoutRequest::class.java)
        return PayoutRequest()
    }

    private fun anyCorrection(): CorrectionRequest {
        any(CorrectionRequest::class.java)
        return CorrectionRequest()
    }

    private fun anyPurchase(): PurchaseRequest {
        any(PurchaseRequest::class.java)
        return PurchaseRequest()
    }

    private fun sampleEntry(entryType: String = "topup") = LedgerEntryDto(
        id = entryId.toString(),
        entryType = entryType,
        eventId = null,
        memberId = memberId.toString(),
        memberDisplayName = "Member",
        drinkId = null,
        amount = BigDecimal("10.00"),
        currency = "EUR",
        accountingMode = "credit",
        source = null,
        actorId = UUID.randomUUID().toString(),
        reversesEntryId = null,
        idempotencyKey = "idem-1",
        createdAt = Instant.now(),
        snapshot = null
    )

    private fun sampleBalance() = MemberBalanceDto(
        memberId = memberId.toString(),
        currency = "EUR",
        creditBalance = BigDecimal("7.00"),
        topupTotal = BigDecimal("10.00"),
        payoutTotal = BigDecimal("3.00"),
        purchaseTotal = BigDecimal("0.00"),
        correctionTotal = BigDecimal("0.00"),
        entryCount = 2
    )

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `POST purchases creates a purchase and returns 201`() {
        `when`(ledgerService.purchaseByBarcode(anyPurchase(), anyKey(), anyPrincipal()))
            .thenReturn(sampleEntry("purchase").copy(source = "pwaBarcode", drinkId = UUID.randomUUID().toString()))

        mockMvc.perform(
            post("/api/v1/ledger/purchases")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "purchase-1")
                .content(objectMapper.writeValueAsString(PurchaseRequest(eventId = UUID.randomUUID().toString(), barcode = "4000000000001")))
                .with(jwt().jwt { it.subject("sub-member").claim("realm_access", mapOf("roles" to listOf("member"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.entryType").value("purchase"))
            .andExpect(jsonPath("$.source").value("pwaBarcode"))
    }

    @Test
    fun `POST purchases returns 401 when unauthenticated`() {
        mockMvc.perform(
            post("/api/v1/ledger/purchases")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "purchase-1")
                .content(objectMapper.writeValueAsString(PurchaseRequest(eventId = UUID.randomUUID().toString(), barcode = "4000000000001")))
        )
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `POST purchases rejects a missing barcode with 400`() {
        mockMvc.perform(
            post("/api/v1/ledger/purchases")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "purchase-1")
                .content("{\"eventId\":\"${UUID.randomUUID()}\"}")
                .with(jwt().jwt { it.subject("sub-member") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `POST topups returns 401 when unauthenticated`() {
        mockMvc.perform(
            post("/api/v1/ledger/topups")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "idem-1")
                .content(objectMapper.writeValueAsString(TopupRequest(memberId = memberId.toString(), amount = BigDecimal("10.00"))))
        )
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `POST topups creates a topup and returns 201`() {
        `when`(ledgerService.topup(anyTopup(), anyKey(), anyPrincipal())).thenReturn(sampleEntry("topup"))

        mockMvc.perform(
            post("/api/v1/ledger/topups")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "idem-1")
                .content(objectMapper.writeValueAsString(TopupRequest(memberId = memberId.toString(), amount = BigDecimal("10.00"))))
                .with(jwt().jwt { it.subject("sub-admin").claim("realm_access", mapOf("roles" to listOf("admin"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").value(entryId.toString()))
            .andExpect(jsonPath("$.entryType").value("topup"))
    }

    @Test
    fun `POST topups rejects a non positive amount with 400`() {
        mockMvc.perform(
            post("/api/v1/ledger/topups")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "idem-1")
                .content("{\"memberId\":\"$memberId\",\"amount\":0}")
                .with(jwt().jwt { it.subject("sub-admin") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `POST payouts creates a payout and returns 201`() {
        `when`(ledgerService.payout(anyPayout(), anyKey(), anyPrincipal())).thenReturn(sampleEntry("payout"))

        mockMvc.perform(
            post("/api/v1/ledger/payouts")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "idem-2")
                .content(objectMapper.writeValueAsString(PayoutRequest(memberId = memberId.toString(), amount = BigDecimal("4.50"))))
                .with(jwt().jwt { it.subject("sub-admin").claim("realm_access", mapOf("roles" to listOf("admin"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.entryType").value("payout"))
    }

    @Test
    fun `POST corrections creates a correction and returns 201`() {
        `when`(ledgerService.correct(anyCorrection(), anyKey(), anyPrincipal()))
            .thenReturn(sampleEntry("correction").copy(reversesEntryId = UUID.randomUUID().toString()))

        mockMvc.perform(
            post("/api/v1/ledger/corrections")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Idempotency-Key", "idem-3")
                .content(objectMapper.writeValueAsString(CorrectionRequest(originalEntryId = UUID.randomUUID().toString())))
                .with(jwt().jwt { it.subject("sub-admin").claim("realm_access", mapOf("roles" to listOf("admin"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.entryType").value("correction"))
            .andExpect(jsonPath("$.reversesEntryId").exists())
    }

    @Test
    fun `GET balance returns the member balance`() {
        `when`(ledgerService.getMemberBalance(any(UUID::class.java) ?: memberId, anyPrincipal())).thenReturn(sampleBalance())

        mockMvc.perform(
            get("/api/v1/ledger/members/$memberId/balance")
                .with(jwt().jwt { it.subject("sub-member") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.memberId").value(memberId.toString()))
            .andExpect(jsonPath("$.creditBalance").value(7.00))
    }

    @Test
    fun `GET balance rejects a syntactically invalid identifier with 400`() {
        mockMvc.perform(
            get("/api/v1/ledger/members/not-a-uuid/balance")
                .with(jwt().jwt { it.subject("sub-member") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("invalid_request"))
            .andExpect(jsonPath("$.traceId").exists())
    }
}
