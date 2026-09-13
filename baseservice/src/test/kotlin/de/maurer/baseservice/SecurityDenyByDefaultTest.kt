package de.maurer.baseservice

import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.web.RequestIdFilter
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@SpringBootTest
@ActiveProfiles("test")
class SecurityDenyByDefaultTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `unauthenticated access to protected endpoint is denied by default with 401`() {
        mockMvc.perform(get("/api/v1/auth/me"))
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.code").value(ErrorCode.ACCESS_DENIED))
            .andExpect(jsonPath("$.status").value(401))
            .andExpect(jsonPath("$.instance").value("/api/v1/auth/me"))
            .andExpect(jsonPath("$.traceId").exists())
            .andExpect(header().exists(RequestIdFilter.HEADER_NAME))
    }

    @Test
    fun `unauthenticated access to arbitrary endpoint is denied by default with 401`() {
        mockMvc.perform(get("/api/v1/events"))
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.code").value(ErrorCode.ACCESS_DENIED))
            .andExpect(jsonPath("$.status").value(401))
    }

    @Test
    fun `authenticated request with jwt token succeeds and returns no raw claims`() {
        mockMvc.perform(
            get("/api/v1/auth/me")
                .with(jwt().jwt {
                    it.subject("test-user-sub-123")
                    it.claim("email", "test@example.com")
                    it.claim("name", "Max Mustermann")
                    it.claim("roles", listOf("member"))
                    it.claim("permissions", listOf("profile.read.self"))
                    it.claim("internal_secret_claim", "must-not-leak")
                })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.subject").value("test-user-sub-123"))
            .andExpect(jsonPath("$.displayName").value("Max Mustermann"))
            .andExpect(jsonPath("$.roles[0]").value("member"))
            .andExpect(jsonPath("$.permissions[0]").value("profile.read.self"))
            .andExpect(jsonPath("$.attributes").doesNotExist())
            .andExpect(jsonPath("$.email").doesNotExist())
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("must-not-leak"))))
    }

    @Test
    fun `valid token without required role is rejected with 403 and problem detail`() {
        mockMvc.perform(
            get("/actuator/metrics")
                .with(jwt().jwt { it.subject("sub-member").claim("roles", listOf("member")) })
        )
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.code").value(ErrorCode.PERMISSION_DENIED))
            .andExpect(jsonPath("$.status").value(403))
            .andExpect(jsonPath("$.traceId").exists())
            .andExpect(header().exists(RequestIdFilter.HEADER_NAME))
    }

    @Test
    fun `actuator endpoints beyond health and info require the admin role`() {
        mockMvc.perform(get("/actuator/env"))
            .andExpect(status().isUnauthorized)

        mockMvc.perform(
            get("/actuator/env")
                .with(jwt().jwt { it.subject("sub-board").claim("roles", listOf("board")) })
        )
            .andExpect(status().isForbidden)
    }

    @Test
    fun `given trace id header is reused as correlation id`() {
        mockMvc.perform(get("/api/v1/auth/me").header(RequestIdFilter.HEADER_NAME, "trace-abc-123"))
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.traceId").value("trace-abc-123"))
            .andExpect(header().string(RequestIdFilter.HEADER_NAME, "trace-abc-123"))
    }
}
