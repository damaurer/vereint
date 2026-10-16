package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.controller.AccessResolverController
import de.maurer.baseservice.dto.AccessCheckRequest
import de.maurer.baseservice.dto.AccessCheckResponse
import de.maurer.baseservice.dto.AccessDecisionDto
import de.maurer.baseservice.dto.RolePermissionMatrixDto
import de.maurer.baseservice.security.AppContext
import de.maurer.baseservice.security.RolePermissionMatrix
import de.maurer.baseservice.service.AccessResolverService
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

@SpringBootTest
@ActiveProfiles("test")
class AccessResolverControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var accessResolverService: AccessResolverService

    @Autowired
    private lateinit var accessResolverController: AccessResolverController

    private lateinit var mockMvc: MockMvc

    @Suppress("UNCHECKED_CAST")
    private fun <T> anyObject(): T {
        any<T>()
        return null as T
    }

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
        accessResolverController.resetGuestRateLimit()
    }

    @Test
    fun `GET access endpoint requires authentication and returns 401 unauthenticated`() {
        mockMvc.perform(get("/api/v1/auth/access"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GET access endpoint returns access decision when authenticated`() {
        `when`(accessResolverService.resolveUserAccess(anyObject())).thenReturn(
            AccessDecisionDto(
                subject = "sub-test-123",
                userId = "usr-1",
                displayName = "Test User",
                email = "test@example.com",
                disabled = false,
                roles = setOf("member"),
                boardRole = null,
                drinkRecorder = false,
                permissions = setOf("profile.read.self"),
                eventScopes = setOf("evt-1"),
                ownedEvents = setOf("evt-1"),
                allowedAppContexts = setOf(AppContext.MEMBER_PWA)
            )
        )

        mockMvc.perform(
            get("/api/v1/auth/access")
                .with(jwt().jwt { it.subject("sub-test-123") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.subject").value("sub-test-123"))
            .andExpect(jsonPath("$.roles[0]").value("member"))
            .andExpect(jsonPath("$.ownedEvents[0]").value("evt-1"))
            .andExpect(jsonPath("$.matrixVersion").value(RolePermissionMatrix.VERSION))
            .andExpect(jsonPath("$.allowedAppContexts[0]").value(AppContext.MEMBER_PWA))
    }

    @Test
    fun `GET matrix endpoint requires authentication`() {
        mockMvc.perform(get("/api/v1/auth/access/matrix"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GET matrix endpoint returns the versioned role permission matrix`() {
        `when`(accessResolverService.describeRolePermissionMatrix()).thenReturn(
            RolePermissionMatrixDto(
                version = RolePermissionMatrix.VERSION,
                roles = RolePermissionMatrix.MATRIX,
                assignableRoles = RolePermissionMatrix.SYSTEM_ROLES,
                knownPermissions = RolePermissionMatrix.KNOWN_PERMISSIONS,
                appContexts = AccessResolverService.ALL_APP_CONTEXTS
            )
        )

        mockMvc.perform(
            get("/api/v1/auth/access/matrix")
                .with(jwt().jwt { it.subject("sub-test-123") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.version").value(RolePermissionMatrix.VERSION))
            .andExpect(jsonPath("$.roles.member").isArray)
            .andExpect(jsonPath("$.appContexts").isArray)
    }

    @Test
    fun `POST check endpoint returns access check response`() {
        `when`(accessResolverService.checkAccess(anyObject(), anyObject())).thenReturn(
            AccessCheckResponse(
                allowed = true,
                reason = "Access granted",
                appContext = AppContext.MEMBER_PWA
            )
        )

        val request = AccessCheckRequest(appContext = AppContext.MEMBER_PWA)

        mockMvc.perform(
            post("/api/v1/auth/access/check")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(jwt().jwt { it.subject("sub-test-123") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.allowed").value(true))
            .andExpect(jsonPath("$.appContext").value(AppContext.MEMBER_PWA))
    }

    @Test
    fun `POST guest endpoint is publicly accessible without JWT`() {
        `when`(accessResolverService.validateGuestAccess("evt-123", "secret-token")).thenReturn(
            AccessCheckResponse(
                allowed = true,
                reason = "Guest access granted",
                appContext = AppContext.EVENT_GUEST,
                eventId = "evt-123"
            )
        )

        val request = AccessCheckRequest(appContext = AppContext.EVENT_GUEST, eventId = "evt-123", guestToken = "secret-token")

        mockMvc.perform(
            post("/api/v1/auth/access/guest")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.allowed").value(true))
            .andExpect(jsonPath("$.appContext").value(AppContext.EVENT_GUEST))
            .andExpect(jsonPath("$.eventId").value("evt-123"))
    }

    @Test
    fun `POST guest endpoint rate limits repeated attempts per ip and event`() {
        `when`(accessResolverService.validateGuestAccess("evt-rate", "wrong-token")).thenReturn(
            AccessCheckResponse(
                allowed = false,
                reason = "Invalid guest token",
                errorCode = "access_denied",
                appContext = AppContext.EVENT_GUEST,
                eventId = "evt-rate"
            )
        )

        val request = AccessCheckRequest(
            appContext = AppContext.EVENT_GUEST,
            eventId = "evt-rate",
            guestToken = "wrong-token"
        )
        val payload = objectMapper.writeValueAsString(request)

        repeat(AccessResolverController.GUEST_ATTEMPT_LIMIT) {
            mockMvc.perform(
                post("/api/v1/auth/access/guest")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(payload)
            )
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.allowed").value(false))
        }

        mockMvc.perform(
            post("/api/v1/auth/access/guest")
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload)
        )
            .andExpect(status().isTooManyRequests)
            .andExpect(jsonPath("$.allowed").value(false))
            .andExpect(jsonPath("$.errorCode").value(AccessResolverController.RATE_LIMIT_EXCEEDED))
    }
}
