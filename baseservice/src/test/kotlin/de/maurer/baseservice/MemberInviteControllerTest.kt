package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.MemberInvitePreviewDto
import de.maurer.baseservice.dto.RegisterMemberRequest
import de.maurer.baseservice.dto.RegisterMemberResponse
import de.maurer.baseservice.service.MemberInviteService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class MemberInviteControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var memberInviteService: MemberInviteService

    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setup() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
            .apply<DefaultMockMvcBuilder>(springSecurity())
            .build()
    }

    private fun anyRegisterRequest(): RegisterMemberRequest {
        any(RegisterMemberRequest::class.java)
        return RegisterMemberRequest()
    }

    private fun validRegistration() = RegisterMemberRequest(
        token = "raw-token",
        firstName = "Anna",
        lastName = "Neumann",
        email = "anna@example.org",
        password = "sehr-geheimes-passwort",
        acceptTerms = true
    )

    @Test
    fun `managing links requires authentication`() {
        mockMvc.perform(get("/api/v1/member-invites")).andExpect(status().isUnauthorized)
        mockMvc.perform(
            post("/api/v1/member-invites").contentType(MediaType.APPLICATION_JSON).content("{}")
        ).andExpect(status().isUnauthorized)
        mockMvc.perform(delete("/api/v1/member-invites/${UUID.randomUUID()}")).andExpect(status().isUnauthorized)
    }

    @Test
    fun `preview is public`() {
        `when`(memberInviteService.preview(anyString()))
            .thenReturn(MemberInvitePreviewDto(expiresAt = Instant.parse("2026-11-01T10:00:00Z")))

        mockMvc.perform(
            post("/api/v1/member-invites/preview")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"raw-token\"}")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.expiresAt").exists())
    }

    @Test
    fun `register is public and returns 201`() {
        `when`(memberInviteService.register(anyRegisterRequest()))
            .thenReturn(RegisterMemberResponse(email = "anna@example.org", displayName = "Anna Neumann"))

        mockMvc.perform(
            post("/api/v1/member-invites/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(validRegistration()))
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.email").value("anna@example.org"))
            .andExpect(jsonPath("$.password").doesNotExist())
    }

    @Test
    fun `register validates the payload before the service runs`() {
        mockMvc.perform(
            post("/api/v1/member-invites/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(validRegistration().copy(password = "kurz")))
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))

        mockMvc.perform(
            post("/api/v1/member-invites/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(validRegistration().copy(email = "keine-mail")))
        )
            .andExpect(status().isBadRequest)

        verify(memberInviteService, never()).register(anyRegisterRequest())
    }
}
