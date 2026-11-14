package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.NotificationDto
import de.maurer.baseservice.dto.PushSubscriptionDto
import de.maurer.baseservice.dto.RegisterPushSubscriptionRequest
import de.maurer.baseservice.dto.SendNotificationRequest
import de.maurer.baseservice.dto.UnreadCountDto
import de.maurer.baseservice.dto.VapidPublicKeyDto
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.NotificationService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.`when`
import org.mockito.Mockito.doNothing
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
class NotificationControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var notificationService: NotificationService

    private lateinit var mockMvc: MockMvc

    private val notificationId: UUID = UUID.randomUUID()
    private val subscriptionId: UUID = UUID.randomUUID()
    private val targetId: UUID = UUID.randomUUID()

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return UUID.randomUUID()
    }

    private fun sampleNotification() = NotificationDto(
        id = notificationId.toString(),
        title = "Hallo",
        body = "Text",
        type = "general",
        read = false,
        createdAt = Instant.now()
    )

    private fun sampleSubscription() = PushSubscriptionDto(
        id = subscriptionId.toString(),
        endpoint = "https://push.example/abc",
        userAgent = "Firefox",
        createdAt = Instant.now(),
        updatedAt = Instant.now()
    )

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `GET notifications returns 401 when unauthenticated`() {
        mockMvc.perform(get("/api/v1/notifications"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GET notifications lists the callers notifications`() {
        `when`(notificationService.listOwnNotifications(anyPrincipal()))
            .thenReturn(listOf(sampleNotification()))

        mockMvc.perform(
            get("/api/v1/notifications")
                .with(jwt().jwt { it.subject("sub-caller") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].title").value("Hallo"))
    }

    @Test
    fun `GET unread-count returns the count`() {
        `when`(notificationService.unreadCount(anyPrincipal())).thenReturn(UnreadCountDto(3))

        mockMvc.perform(
            get("/api/v1/notifications/unread-count")
                .with(jwt().jwt { it.subject("sub-caller") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.unread").value(3))
    }

    @Test
    fun `POST read marks a notification and returns 200`() {
        `when`(notificationService.markRead(anyUuid(), anyPrincipal())).thenReturn(sampleNotification())

        mockMvc.perform(
            post("/api/v1/notifications/$notificationId/read")
                .with(jwt().jwt { it.subject("sub-caller") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(notificationId.toString()))
    }

    @Test
    fun `POST read rejects an invalid identifier with 400`() {
        mockMvc.perform(
            post("/api/v1/notifications/not-a-uuid/read")
                .with(jwt().jwt { it.subject("sub-caller") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("invalid_request"))
    }

    @Test
    fun `GET vapid-public-key returns the key`() {
        `when`(notificationService.vapidPublicKey())
            .thenReturn(VapidPublicKeyDto(enabled = true, publicKey = "public-key-value"))

        mockMvc.perform(
            get("/api/v1/notifications/vapid-public-key")
                .with(jwt().jwt { it.subject("sub-caller") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.enabled").value(true))
            .andExpect(jsonPath("$.publicKey").value("public-key-value"))
    }

    @Test
    fun `POST subscriptions registers and returns 201`() {
        `when`(notificationService.registerSubscription(any(RegisterPushSubscriptionRequest::class.java) ?: RegisterPushSubscriptionRequest(), anyPrincipal()))
            .thenReturn(sampleSubscription())

        mockMvc.perform(
            post("/api/v1/notifications/subscriptions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        RegisterPushSubscriptionRequest(
                            endpoint = "https://push.example/abc",
                            p256dh = "key-p256dh",
                            auth = "key-auth",
                            userAgent = "Firefox"
                        )
                    )
                )
                .with(jwt().jwt { it.subject("sub-caller") })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.endpoint").value("https://push.example/abc"))
    }

    @Test
    fun `POST subscriptions rejects a blank endpoint with 400`() {
        mockMvc.perform(
            post("/api/v1/notifications/subscriptions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"endpoint\":\"\",\"p256dh\":\"a\",\"auth\":\"b\"}")
                .with(jwt().jwt { it.subject("sub-caller") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
    }

    @Test
    fun `DELETE subscription returns 204`() {
        doNothing().`when`(notificationService).deleteSubscription(anyUuid(), anyPrincipal())

        mockMvc.perform(
            delete("/api/v1/notifications/subscriptions/$subscriptionId")
                .with(jwt().jwt { it.subject("sub-caller") })
        )
            .andExpect(status().isNoContent)
    }

    @Test
    fun `POST notification sends and returns 201`() {
        `when`(notificationService.sendNotification(any(SendNotificationRequest::class.java) ?: SendNotificationRequest(), anyPrincipal()))
            .thenReturn(sampleNotification())

        mockMvc.perform(
            post("/api/v1/notifications")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        SendNotificationRequest(
                            userId = targetId.toString(),
                            title = "Hallo",
                            body = "Text",
                            type = "invite"
                        )
                    )
                )
                .with(jwt().jwt { it.subject("sub-admin").claim("realm_access", mapOf("roles" to listOf("admin"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.title").value("Hallo"))
    }

    @Test
    fun `POST notification rejects a blank title with 400`() {
        mockMvc.perform(
            post("/api/v1/notifications")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"userId\":\"$targetId\",\"title\":\"\",\"body\":\"Text\"}")
                .with(jwt().jwt { it.subject("sub-admin") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
    }
}
