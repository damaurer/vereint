package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.UserService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyBoolean
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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class UserControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var userService: UserService

    private lateinit var mockMvc: MockMvc

    /** Nach außen bleibt die Kennung eine Zeichenkette, intern ist sie eine UUID. */
    private val targetId: UUID = UUID.randomUUID()

    @Suppress("UNCHECKED_CAST")
    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return UUID.randomUUID()
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> anySet(): Set<T> {
        any(Set::class.java)
        return emptySet()
    }

    private fun anyUpdateProfileRequest(): UpdateProfileRequest {
        any(UpdateProfileRequest::class.java)
        return UpdateProfileRequest()
    }

    private fun anyAdminUpdateUserRequest(): AdminUpdateUserRequest {
        any(AdminUpdateUserRequest::class.java)
        return AdminUpdateUserRequest()
    }

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `GET me endpoint returns 401 when unauthenticated`() {
        mockMvc.perform(get("/api/v1/users/me"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GET me endpoint returns user profile when authenticated`() {
        `when`(userService.getProfile(anyPrincipal())).thenReturn(
            UserProfileDto(
                id = "usr-123",
                keycloakSubject = "sub-123",
                displayName = "Max Mustermann",
                email = "max@example.com",
                disabled = false,
                drinkRecorder = false,
                boardRole = null,
                roles = setOf("member"),
                permissions = setOf("profile.read.self"),
                createdAt = Instant.now(),
                updatedAt = Instant.now()
            )
        )

        mockMvc.perform(
            get("/api/v1/users/me")
                .with(jwt().jwt { it.subject("sub-123").claim("preferred_username", "max") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value("usr-123"))
            .andExpect(jsonPath("$.displayName").value("Max Mustermann"))
            .andExpect(jsonPath("$.roles[0]").value("member"))
    }

    @Test
    fun `PUT me endpoint updates profile and returns updated profile`() {
        `when`(userService.updateProfile(anyPrincipal(), anyUpdateProfileRequest())).thenReturn(
            UserProfileDto(
                id = "usr-123",
                keycloakSubject = "sub-123",
                displayName = "Max Updated",
                email = "updated@example.com",
                disabled = false,
                drinkRecorder = false,
                boardRole = null,
                roles = setOf("member"),
                permissions = setOf("profile.read.self"),
                createdAt = Instant.now(),
                updatedAt = Instant.now()
            )
        )

        val request = UpdateProfileRequest(displayName = "Max Updated", email = "updated@example.com")

        mockMvc.perform(
            put("/api/v1/users/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(jwt().jwt { it.subject("sub-123") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.displayName").value("Max Updated"))
            .andExpect(jsonPath("$.email").value("updated@example.com"))
    }

    @Test
    fun `GET users endpoint returns a paginated user list`() {
        `when`(userService.listUsers(any(), any(), any(), any(), anyPrincipal())).thenReturn(
            PagedResponse(
                content = listOf(
                    UserSummaryDto(
                        id = "usr-1",
                        keycloakSubject = "sub-1",
                        displayName = "User One",
                        email = "one@example.com",
                        disabled = false,
                        drinkRecorder = false,
                        boardRole = null,
                        roles = setOf("member"),
                        createdAt = Instant.now()
                    )
                ),
                page = 0,
                size = 25,
                totalElements = 1,
                totalPages = 1,
                sort = listOf("displayName,asc")
            )
        )

        mockMvc.perform(
            get("/api/v1/users")
                .with(jwt().jwt { it.subject("sub-admin").claim("realm_access", mapOf("roles" to listOf("admin"))) })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.content[0].id").value("usr-1"))
            .andExpect(jsonPath("$.content[0].displayName").value("User One"))
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(25))
            .andExpect(jsonPath("$.totalElements").value(1))
    }

    @Test
    fun `PUT roles rejects unknown role names with 400 and field details`() {
        mockMvc.perform(
            put("/api/v1/users/$targetId/roles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"roles\":[\"super_mega_admin\"]}")
                .with(jwt().jwt { it.subject("sub-admin") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `PUT me rejects an invalid email address with 400`() {
        mockMvc.perform(
            put("/api/v1/users/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"not-an-email\"}")
                .with(jwt().jwt { it.subject("sub-123") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
    }

    @Test
    fun `GET users by id returns profile`() {
        `when`(userService.getUserById(anyUuid(), anyPrincipal())).thenReturn(
            UserProfileDto(
                id = targetId.toString(),
                keycloakSubject = "sub-target",
                displayName = "Target User",
                email = "target@example.com",
                disabled = false,
                drinkRecorder = false,
                boardRole = null,
                roles = setOf("member"),
                permissions = setOf("profile.read.self"),
                createdAt = Instant.now(),
                updatedAt = Instant.now()
            )
        )

        mockMvc.perform(
            get("/api/v1/users/$targetId")
                .with(jwt().jwt { it.subject("sub-admin") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(targetId.toString()))
            .andExpect(jsonPath("$.displayName").value("Target User"))
    }

    @Test
    fun `GET users by id rejects a syntactically invalid identifier with 400`() {
        mockMvc.perform(
            get("/api/v1/users/not-a-uuid")
                .with(jwt().jwt { it.subject("sub-admin") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("invalid_request"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `PUT roles assigns new roles`() {
        `when`(userService.assignRoles(anyUuid(), anySet(), anyPrincipal())).thenReturn(
            UserProfileDto(
                id = targetId.toString(),
                keycloakSubject = "sub-target",
                displayName = "Target User",
                email = "target@example.com",
                disabled = false,
                drinkRecorder = false,
                boardRole = null,
                roles = setOf("board"),
                permissions = setOf("profile.read.self"),
                createdAt = Instant.now(),
                updatedAt = Instant.now()
            )
        )

        val request = AssignRolesRequest(roles = setOf(UserRole.BOARD))

        mockMvc.perform(
            put("/api/v1/users/$targetId/roles")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(jwt().jwt { it.subject("sub-admin") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.roles[0]").value("board"))
    }

    @Test
    fun `PUT status sets disabled flag`() {
        `when`(userService.setUserStatus(anyUuid(), anyBoolean(), anyPrincipal())).thenReturn(
            UserProfileDto(
                id = targetId.toString(),
                keycloakSubject = "sub-target",
                displayName = "Target User",
                email = "target@example.com",
                disabled = true,
                drinkRecorder = false,
                boardRole = null,
                roles = setOf("member"),
                permissions = setOf("profile.read.self"),
                createdAt = Instant.now(),
                updatedAt = Instant.now()
            )
        )

        val request = UpdateUserStatusRequest(disabled = true)

        mockMvc.perform(
            put("/api/v1/users/$targetId/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
                .with(jwt().jwt { it.subject("sub-admin") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.disabled").value(true))
    }
}
