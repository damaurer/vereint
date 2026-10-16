package de.maurer.baseservice

import de.maurer.baseservice.billing.BillingService
import de.maurer.baseservice.billing.PlanLimits
import de.maurer.baseservice.domain.BillingInterval
import de.maurer.baseservice.domain.BillingPlan
import de.maurer.baseservice.domain.SubscriptionStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.repository.StammtischSubscriptionRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.KioskService
import de.maurer.baseservice.service.MembershipService
import de.maurer.baseservice.service.PlatformService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.support.DefaultStammtischExtension.Companion.DEFAULT_STAMMTISCH_ID
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.HexFormat
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Tarife je Stammtisch: Grenzen, Stripe-Webhooks (Signatur, einmalige
 * Wirkung, Kulanzfrist) und der Nur-Lesen-Zustand nach offener Zahlung.
 */
@SpringBootTest(
    properties = [
        "vereint.billing.stripe-enabled=true",
        "vereint.billing.stripe-secret-key=sk_test_dummy",
        "vereint.billing.stripe-webhook-secret=whsec_test",
        "vereint.billing.prices.stammtisch-month=price_st_m",
        "vereint.billing.prices.verein-year=price_ve_y"
    ]
)
@ActiveProfiles("test")
class BillingIntegrationTest @Autowired constructor(
    private val context: WebApplicationContext,
    private val platformService: PlatformService,
    private val membershipService: MembershipService,
    private val kioskService: KioskService,
    private val billingService: BillingService,
    private val planLimits: PlanLimits,
    private val userService: UserService,
    private val subscriptionRepository: StammtischSubscriptionRepository,
    private val tenantTransactions: TenantTransactions
) {

    private lateinit var mockMvc: MockMvc
    private lateinit var platform: UserPrincipal
    private lateinit var stammtischB: UUID

    @BeforeEach
    fun setup() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
            .apply<DefaultMockMvcBuilder>(springSecurity())
            .build()
        platform = UserPrincipal(
            subject = "kc-platform-${UUID.randomUUID()}",
            displayName = "Plattform",
            roles = setOf(UserRole.ADMIN),
            platformAdmin = true
        )
        stammtischB = UUID.fromString(platformService.create(CreateStammtischRequest(name = "Tarif B"), platform).id)
    }

    private fun newUser(): UserEntity =
        userService.getOrCreateUser(UserPrincipal(subject = "kc-${UUID.randomUUID()}", displayName = "Neu"))

    private fun subscriptionB() = tenantTransactions.readAsSystem { subscriptionRepository.findById(stammtischB).orElse(null) }

    @Test
    fun `existing Stammtisch keeps all features without payment`() {
        val subscription = tenantTransactions.readAsSystem { subscriptionRepository.findById(DEFAULT_STAMMTISCH_ID).orElseThrow() }
        assertEquals(BillingPlan.verein, subscription.plan)
        assertEquals(SubscriptionStatus.comped, subscription.status)
    }

    @Test
    fun `free plan allows ten members and no videos`() {
        // Die anlegende Person ist das erste Mitglied.
        repeat(9) { tenantTransactions.inStammtisch(stammtischB) { membershipService.addMember(newUser()) } }
        val error = assertThrows(ApiException::class.java) {
            tenantTransactions.inStammtisch(stammtischB) { membershipService.addMember(newUser()) }
        }
        assertEquals(ErrorCode.PLAN_LIMIT_MEMBERS, error.errorCode)
        val videos = assertThrows(ApiException::class.java) {
            tenantTransactions.readInStammtisch(stammtischB) { planLimits.requireVideos() }
        }
        assertEquals(ErrorCode.PLAN_LIMIT_VIDEOS, videos.errorCode)

        platformService.update(stammtischB, de.maurer.baseservice.dto.UpdatePlatformStammtischRequest(plan = "stammtisch"), platform)
        tenantTransactions.inStammtisch(stammtischB) { membershipService.addMember(newUser()) }
        tenantTransactions.readInStammtisch(stammtischB) { planLimits.requireVideos() }
        assertEquals(SubscriptionStatus.comped, subscriptionB()!!.status)
    }

    @Test
    fun `only the Verein plan runs several bar terminals`() {
        val adminB = platform.copy(roles = setOf(UserRole.ADMIN, UserRole.MEMBER), stammtischId = stammtischB.toString())
        TenantContext.runIn(stammtischB) { kioskService.start("1234", "Theke 1", adminB) }
        val error = assertThrows(ApiException::class.java) {
            TenantContext.runIn(stammtischB) { kioskService.start("1234", "Theke 2", adminB) }
        }
        assertEquals(ErrorCode.PLAN_LIMIT_KIOSK, error.errorCode)

        platformService.update(stammtischB, de.maurer.baseservice.dto.UpdatePlatformStammtischRequest(plan = "verein"), platform)
        TenantContext.runIn(stammtischB) { kioskService.start("1234", "Theke 2", adminB) }
    }

    @Test
    fun `webhooks book the plan, start the grace period and act only once`() {
        val subId = "sub_${UUID.randomUUID()}"
        webhook(
            "checkout.session.completed",
            """{"mode":"subscription","client_reference_id":"$stammtischB","customer":"cus_1","subscription":"$subId","metadata":{"kind":"plan","stammtisch_id":"$stammtischB"}}"""
        ).andExpect(status().isOk)
        val periodEnd = Instant.now().plus(365, ChronoUnit.DAYS).epochSecond
        webhook(
            "customer.subscription.updated",
            """{"id":"$subId","customer":"cus_1","status":"active","metadata":{"kind":"plan","stammtisch_id":"$stammtischB"},
               "items":{"data":[{"price":{"id":"price_ve_y"},"current_period_end":$periodEnd}]}}"""
        ).andExpect(status().isOk)

        val active = subscriptionB()!!
        assertEquals(BillingPlan.verein, active.plan)
        assertEquals(BillingInterval.year, active.billingInterval)
        assertEquals(SubscriptionStatus.active, active.status)
        assertEquals("cus_1", active.stripeCustomerId)
        assertEquals(periodEnd, active.currentPeriodEnd!!.epochSecond)

        val failedId = "evt_${UUID.randomUUID()}"
        val failed = """{"parent":{"subscription_details":{"subscription":"$subId"}}}"""
        webhook("invoice.payment_failed", failed, failedId).andExpect(status().isOk)
        val pastDue = subscriptionB()!!
        assertEquals(SubscriptionStatus.past_due, pastDue.status)
        val grace = assertNotNull(pastDue.graceUntil).let { pastDue.graceUntil!! }
        assertTrue(grace.isAfter(Instant.now().plus(29, ChronoUnit.DAYS)))
        assertFalse(billingService.isReadOnly(stammtischB))

        // Doppelte Zustellung ändert nichts.
        webhook("invoice.payment_failed", failed, failedId).andExpect(status().isOk)
        assertEquals(grace, subscriptionB()!!.graceUntil)

        webhook("invoice.paid", """{"subscription":"$subId"}""").andExpect(status().isOk)
        assertEquals(SubscriptionStatus.active, subscriptionB()!!.status)
        assertNull(subscriptionB()!!.graceUntil)

        webhook("customer.subscription.deleted", """{"id":"$subId","status":"canceled"}""").andExpect(status().isOk)
        val canceled = subscriptionB()!!
        assertEquals(BillingPlan.free, canceled.plan)
        assertEquals(SubscriptionStatus.canceled, canceled.status)
    }

    @Test
    fun `webhooks with a wrong signature are rejected`() {
        val payload = """{"id":"evt_x","type":"invoice.paid","data":{"object":{}}}"""
        mockMvc.perform(
            post("/api/v1/billing/stripe/webhook")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Stripe-Signature", "t=${Instant.now().epochSecond},v1=${"0".repeat(64)}")
                .content(payload)
        ).andExpect(status().isBadRequest)
        mockMvc.perform(
            post("/api/v1/billing/stripe/webhook")
                .contentType(MediaType.APPLICATION_JSON)
                .header("Stripe-Signature", sign(payload, Instant.now().minus(10, ChronoUnit.MINUTES).epochSecond))
                .content(payload)
        ).andExpect(status().isBadRequest)
    }

    @Test
    fun `after the grace period the Stammtisch is read-only but billing and export stay open`() {
        tenantTransactions.asSystem {
            val subscription = subscriptionRepository.findById(stammtischB)
                .orElseGet { de.maurer.baseservice.domain.StammtischSubscriptionEntity(stammtischId = stammtischB) }
            subscription.plan = BillingPlan.stammtisch
            subscription.status = SubscriptionStatus.past_due
            subscription.graceUntil = Instant.now().minus(1, ChronoUnit.DAYS)
            subscriptionRepository.saveAndFlush(subscription)
        }
        val token = jwt().jwt { it.subject(platform.subject).claim("realm_access", mapOf("roles" to listOf("admin"))) }

        mockMvc.perform(
            post("/api/v1/events").header("X-Stammtisch-Id", stammtischB.toString()).with(token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"title":"Neu","startsAt":"${Instant.now().plus(1, ChronoUnit.DAYS)}"}""")
        )
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.code").value(ErrorCode.STAMMTISCH_READ_ONLY))
        mockMvc.perform(get("/api/v1/events").header("X-Stammtisch-Id", stammtischB.toString()).with(token))
            .andExpect(status().isOk)
        mockMvc.perform(get("/api/v1/stammtisch/billing").header("X-Stammtisch-Id", stammtischB.toString()).with(token))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.readOnly").value(true))
            .andExpect(jsonPath("$.canManage").value(true))
            .andExpect(jsonPath("$.limits.maxMembers").value(40))
        mockMvc.perform(get("/api/v1/stammtisch/export").header("X-Stammtisch-Id", stammtischB.toString()).with(token))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.stammtisch.name").value("Tarif B"))
            .andExpect(jsonPath("$.members.length()").value(1))
    }

    private fun webhook(type: String, objectJson: String, eventId: String = "evt_${UUID.randomUUID()}") =
        """{"id":"$eventId","type":"$type","data":{"object":$objectJson}}""".let { payload ->
            mockMvc.perform(
                post("/api/v1/billing/stripe/webhook")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Stripe-Signature", sign(payload, Instant.now().epochSecond))
                    .content(payload)
            )
        }

    private fun sign(payload: String, timestamp: Long): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec("whsec_test".toByteArray(), "HmacSHA256"))
        val signature = HexFormat.of().formatHex(mac.doFinal("$timestamp.$payload".toByteArray()))
        return "t=$timestamp,v1=$signature"
    }
}
