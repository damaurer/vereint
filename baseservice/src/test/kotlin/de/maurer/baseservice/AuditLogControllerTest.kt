package de.maurer.baseservice

import de.maurer.baseservice.dto.AuditLogDto
import de.maurer.baseservice.dto.PagedResponse
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.AuditLogService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.domain.Pageable
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class AuditLogControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @MockitoBean
    private lateinit var auditLogService: AuditLogService

    private lateinit var mockMvc: MockMvc

    private val actorId: UUID = UUID.randomUUID()
    private val targetUserId: UUID = UUID.randomUUID()

    private fun anyStr(): String? = any()

    private fun anyPageable(): Pageable = any(Pageable::class.java) ?: Pageable.unpaged()

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun samplePage() = PagedResponse(
        content = listOf(
            AuditLogDto(
                id = UUID.randomUUID().toString(),
                action = "USER_ROLES_CHANGED",
                targetEntity = "User",
                targetId = targetUserId.toString(),
                actorId = actorId.toString(),
                actorDisplayName = "Admin",
                details = "old=member; new=admin",
                createdAt = Instant.now()
            )
        ),
        page = 0,
        size = 20,
        totalElements = 1,
        totalPages = 1,
        sort = listOf("createdAt,desc")
    )

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `GET audit-logs returns 401 when unauthenticated`() {
        mockMvc.perform(get("/api/v1/audit-logs"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GET audit-logs returns a paged view for an authorized caller`() {
        `when`(auditLogService.listAuditLogs(anyStr(), anyStr(), anyStr(), anyStr(), anyPageable(), anyPrincipal()))
            .thenReturn(samplePage())

        mockMvc.perform(
            get("/api/v1/audit-logs")
                .with(jwt().jwt { it.subject("sub-admin").claim("realm_access", mapOf("roles" to listOf("admin"))) })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.content[0].action").value("USER_ROLES_CHANGED"))
            .andExpect(jsonPath("$.content[0].targetEntity").value("User"))
            .andExpect(jsonPath("$.totalElements").value(1))
            .andExpect(jsonPath("$.sort[0]").value("createdAt,desc"))
    }

    @Test
    fun `GET audit-logs maps a service denial to 403`() {
        `when`(auditLogService.listAuditLogs(anyStr(), anyStr(), anyStr(), anyStr(), anyPageable(), anyPrincipal()))
            .thenThrow(AccessDeniedException("Keine Berechtigung zum Lesen der Audit-Logs", ErrorCode.ACCESS_DENIED))

        mockMvc.perform(
            get("/api/v1/audit-logs")
                .with(jwt().jwt { it.subject("sub-member").claim("realm_access", mapOf("roles" to listOf("member"))) })
        )
            .andExpect(status().isForbidden)
            .andExpect(jsonPath("$.code").value("access_denied"))
            .andExpect(jsonPath("$.traceId").exists())
    }
}
