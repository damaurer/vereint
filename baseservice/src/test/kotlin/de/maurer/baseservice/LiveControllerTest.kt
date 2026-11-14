package de.maurer.baseservice

import de.maurer.baseservice.live.LiveEvent
import de.maurer.baseservice.live.LiveUpdateHub
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.UserService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
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
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.request
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.util.UUID

/**
 * Live-Verbindung (Server-Sent Events): nur angemeldet, ohne gewählte Gruppe,
 * und Signale erreichen nur die eigenen Verbindungen.
 */
@SpringBootTest
@ActiveProfiles("test")
class LiveControllerTest @Autowired constructor(
    private val context: WebApplicationContext,
    private val liveUpdateHub: LiveUpdateHub,
    private val userService: UserService
) {

    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setup() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
            .apply<DefaultMockMvcBuilder>(springSecurity())
            .build()
    }

    private fun connect(subject: String): MvcResult =
        mockMvc.perform(
            get("/api/v1/live")
                .accept(MediaType.TEXT_EVENT_STREAM)
                .with(jwt().jwt { it.subject(subject).claim("name", subject) })
        )
            .andExpect(request().asyncStarted())
            .andReturn()

    private fun userId(subject: String): UUID =
        userService.getOrCreateUser(UserPrincipal(subject = subject, displayName = subject)).id

    /** Wartet kurz, bis der Hintergrund-Thread das Signal geschrieben hat. */
    private fun awaitContent(result: MvcResult, expected: String): String {
        val deadline = System.currentTimeMillis() + 5_000
        while (System.currentTimeMillis() < deadline) {
            val content = result.response.contentAsString
            if (content.contains(expected)) return content
            Thread.sleep(20)
        }
        return result.response.contentAsString
    }

    @Test
    fun `rejects requests without login`() {
        mockMvc.perform(get("/api/v1/live").accept(MediaType.TEXT_EVENT_STREAM))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `streams signals to the own connections only`() {
        val alice = "live-alice-${UUID.randomUUID()}"
        val bob = "live-bob-${UUID.randomUUID()}"
        val aliceStream = connect(alice)
        val bobStream = connect(bob)

        assertTrue(aliceStream.response.contentType!!.startsWith(MediaType.TEXT_EVENT_STREAM_VALUE))
        assertTrue(awaitContent(aliceStream, "event:ready").contains("event:ready"))

        liveUpdateHub.publish(
            listOf(userId(alice)),
            LiveEvent(LiveEvent.CHAT, stammtischId = "s1", conversationId = "c1")
        )
        val content = awaitContent(aliceStream, "event:chat")
        assertTrue(content.contains("event:chat"), content)
        assertTrue(content.contains("\"conversationId\":\"c1\""), content)
        assertFalse(bobStream.response.contentAsString.contains("event:chat"))

        // Ein Lebenszeichen geht an alle Verbindungen.
        liveUpdateHub.heartbeat()
        assertTrue(awaitContent(bobStream, "event:ping").contains("event:ping"))
    }

    @Test
    fun `finishes cleanly when the connection ends`() {
        val subject = "live-timeout-${UUID.randomUUID()}"
        val before = liveUpdateHub.connectionCount()
        val result = connect(subject)
        assertEquals(before + 1, liveUpdateHub.connectionCount())

        // Endet die Verbindung, läuft die asynchrone Weiterleitung ohne neues Token durch.
        liveUpdateHub.disconnect(userId(subject))
        assertEquals(before, liveUpdateHub.connectionCount())
        mockMvc.perform(asyncDispatch(result)).andExpect(status().isOk)
    }
}
