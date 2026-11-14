package de.maurer.baseservice

import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.KioskService
import de.maurer.baseservice.service.MembershipService
import de.maurer.baseservice.service.MomentConfigService
import de.maurer.baseservice.service.PlatformService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.junit.jupiter.api.Assertions.assertEquals
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
import java.util.UUID

/** Gruppen haben keine Tarife: keine Grenzen, keine Zahlung, Export für Gruppen-Admins. */
@SpringBootTest
@ActiveProfiles("test")
class GroupWithoutLimitsIntegrationTest @Autowired constructor(
    private val context: WebApplicationContext,
    private val platformService: PlatformService,
    private val membershipService: MembershipService,
    private val kioskService: KioskService,
    private val momentConfigService: MomentConfigService,
    private val userService: UserService,
    private val tenantTransactions: TenantTransactions
) {

    private lateinit var mockMvc: MockMvc
    private lateinit var platform: UserPrincipal
    private lateinit var group: UUID

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
        group = UUID.fromString(platformService.create(CreateStammtischRequest(name = "Ohne Grenzen"), platform).id)
    }

    private fun newUser(): UserEntity =
        userService.getOrCreateUser(UserPrincipal(subject = "kc-${UUID.randomUUID()}", displayName = "Neu"))

    @Test
    fun `a new group takes any number of members, videos and bar terminals`() {
        repeat(15) { tenantTransactions.inStammtisch(group) { membershipService.addMember(newUser()) } }
        assertEquals(16, platformService.list(platform).single { it.id == group.toString() }.memberCount)

        val limits = tenantTransactions.readInStammtisch(group) { momentConfigService.getConfig().mediaLimits }
        assertTrue(limits.videoTypes.isNotEmpty())

        val admin = platform.copy(roles = setOf(UserRole.ADMIN, UserRole.MEMBER), stammtischId = group.toString())
        TenantContext.runIn(group) { kioskService.start("1234", "Theke 1", admin) }
        TenantContext.runIn(group) { kioskService.start("1234", "Theke 2", admin) }
    }

    @Test
    fun `group admins export their data`() {
        val token = jwt().jwt { it.subject(platform.subject).claim("realm_access", mapOf("roles" to listOf("admin"))) }
        mockMvc.perform(get("/api/v1/stammtisch/export").header("X-Stammtisch-Id", group.toString()).with(token))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.stammtisch.name").value("Ohne Grenzen"))
            .andExpect(jsonPath("$.stammtisch.plan").doesNotExist())
            .andExpect(jsonPath("$.members.length()").value(1))
    }

    @Test
    fun `there is no payment webhook any more`() {
        mockMvc.perform(
            post("/api/v1/billing/stripe/webhook").contentType(MediaType.APPLICATION_JSON).content("{}")
        ).andExpect(status().isUnauthorized)
    }
}
