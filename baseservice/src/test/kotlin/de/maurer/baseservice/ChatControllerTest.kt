package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.ChatMessageDto
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.ChatService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
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
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class ChatControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var chatService: ChatService

    private lateinit var mockMvc: MockMvc

    private val eventId: UUID = UUID.randomUUID()
    private val messageId: UUID = UUID.randomUUID()
    private val conversationId: UUID = UUID.randomUUID()

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return UUID.randomUUID()
    }

    private fun anyRequest(): SendMessageRequest {
        any(SendMessageRequest::class.java)
        return SendMessageRequest()
    }

    private fun sampleMessage(senderType: String) = ChatMessageDto(
        id = messageId.toString(),
        conversationId = conversationId.toString(),
        senderType = senderType,
        senderId = UUID.randomUUID().toString(),
        senderName = "Owner",
        message = "Hallo",
        imageUrl = null,
        createdAt = Instant.now()
    )

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `POST messages returns 401 when unauthenticated`() {
        mockMvc.perform(
            post("/api/v1/events/$eventId/chat/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(SendMessageRequest(message = "Hallo")))
        )
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `POST messages sends a member message and returns 201`() {
        `when`(chatService.sendMessage(anyUuid(), anyRequest(), anyPrincipal()))
            .thenReturn(sampleMessage(ChatService.SENDER_TYPE_MEMBER))

        mockMvc.perform(
            post("/api/v1/events/$eventId/chat/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(SendMessageRequest(message = "Hallo")))
                .with(jwt().jwt { it.subject("sub-owner").claim("realm_access", mapOf("roles" to listOf("member"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.message").value("Hallo"))
            .andExpect(jsonPath("$.senderType").value("member"))
    }

    @Test
    fun `POST messages rejects a blank message with 400`() {
        mockMvc.perform(
            post("/api/v1/events/$eventId/chat/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"message\":\"\"}")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `GET messages returns the messages`() {
        `when`(chatService.listMessages(anyUuid(), anyPrincipal()))
            .thenReturn(listOf(sampleMessage(ChatService.SENDER_TYPE_MEMBER)))

        mockMvc.perform(
            get("/api/v1/events/$eventId/chat/messages")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].message").value("Hallo"))
    }

    @Test
    fun `GET messages rejects an invalid identifier with 400`() {
        mockMvc.perform(
            get("/api/v1/events/not-a-uuid/chat/messages")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("invalid_request"))
    }

    @Test
    fun `GET guest messages works without a JWT using the guest token header`() {
        `when`(chatService.listGuestMessages(anyUuid(), anyString()))
            .thenReturn(listOf(sampleMessage(ChatService.SENDER_TYPE_GUEST)))

        mockMvc.perform(
            get("/api/v1/events/$eventId/chat/guest/messages")
                .header("X-Guest-Token", "guest-token-value")
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].senderType").value("guest"))
    }

    @Test
    fun `POST guest message works without a JWT and returns 201`() {
        `when`(chatService.sendGuestMessage(anyUuid(), anyString(), anyRequest()))
            .thenReturn(sampleMessage(ChatService.SENDER_TYPE_GUEST))

        mockMvc.perform(
            post("/api/v1/events/$eventId/chat/guest/messages")
                .header("X-Guest-Token", "guest-token-value")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(SendMessageRequest(message = "Hallo vom Gast")))
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.senderType").value("guest"))
    }
}
