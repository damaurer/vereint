package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.AcceptInviteRequest
import de.maurer.baseservice.dto.AcceptInviteResponse
import de.maurer.baseservice.dto.CreateInviteRequest
import de.maurer.baseservice.dto.CreateInviteResponse
import de.maurer.baseservice.dto.InviteDto
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.InviteService
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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class InviteControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var inviteService: InviteService

    private lateinit var mockMvc: MockMvc

    private val eventId: UUID = UUID.randomUUID()
    private val inviteId: UUID = UUID.randomUUID()

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return UUID.randomUUID()
    }

    private fun anyCreateRequest(): CreateInviteRequest {
        any(CreateInviteRequest::class.java)
        return CreateInviteRequest()
    }

    private fun anyAcceptRequest(): AcceptInviteRequest {
        any(AcceptInviteRequest::class.java)
        return AcceptInviteRequest()
    }

    private fun sampleCreateResponse() = CreateInviteResponse(
        id = inviteId.toString(),
        eventId = eventId.toString(),
        token = "raw-magic-token",
        acceptPath = "/invite/accept?token=raw-magic-token",
        role = "guest",
        maxUses = null,
        usesCount = 0,
        expiresAt = Instant.now().plusSeconds(3600),
        revoked = false,
        createdAt = Instant.now()
    )

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `POST invites returns 401 when unauthenticated`() {
        mockMvc.perform(
            post("/api/v1/events/$eventId/invites")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(CreateInviteRequest()))
        )
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `POST invites creates an invite and returns 201 with the raw token`() {
        `when`(inviteService.createInvite(anyUuid(), anyCreateRequest(), anyPrincipal()))
            .thenReturn(sampleCreateResponse())

        mockMvc.perform(
            post("/api/v1/events/$eventId/invites")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(CreateInviteRequest(maxUses = 3)))
                .with(jwt().jwt { it.subject("sub-owner").claim("realm_access", mapOf("roles" to listOf("member"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").value(inviteId.toString()))
            .andExpect(jsonPath("$.token").value("raw-magic-token"))
            .andExpect(jsonPath("$.role").value("guest"))
    }

    @Test
    fun `POST invites rejects an invalid maxUses with 400`() {
        mockMvc.perform(
            post("/api/v1/events/$eventId/invites")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"maxUses\":0}")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
    }

    @Test
    fun `GET invites lists the invites`() {
        `when`(inviteService.listInvites(anyUuid(), anyPrincipal())).thenReturn(
            listOf(
                InviteDto(
                    id = inviteId.toString(),
                    eventId = eventId.toString(),
                    role = "guest",
                    maxUses = null,
                    usesCount = 0,
                    expiresAt = Instant.now().plusSeconds(3600),
                    revoked = false,
                    active = true,
                    createdById = UUID.randomUUID().toString(),
                    createdAt = Instant.now()
                )
            )
        )

        mockMvc.perform(
            get("/api/v1/events/$eventId/invites")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(inviteId.toString()))
            .andExpect(jsonPath("$[0].active").value(true))
    }

    @Test
    fun `DELETE invite revokes it and returns 204`() {
        mockMvc.perform(
            delete("/api/v1/events/$eventId/invites/$inviteId")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isNoContent)
    }

    @Test
    fun `POST accept is public and returns 201 with a guest token`() {
        `when`(inviteService.acceptInvite(anyAcceptRequest())).thenReturn(
            AcceptInviteResponse(
                guestToken = "raw-guest-token",
                eventId = eventId.toString(),
                eventTitle = "Sommerfest",
                displayName = "Gast",
                status = "active",
                expiresAt = Instant.now().plusSeconds(3600)
            )
        )

        mockMvc.perform(
            post("/api/v1/invites/accept")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(AcceptInviteRequest(token = "raw-magic-token")))
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.guestToken").value("raw-guest-token"))
            .andExpect(jsonPath("$.eventId").value(eventId.toString()))
            .andExpect(jsonPath("$.status").value("active"))
    }

    @Test
    fun `POST accept rejects a blank token with 400`() {
        mockMvc.perform(
            post("/api/v1/invites/accept")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"\"}")
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
    }
}
