package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.EventService
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
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class EventControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var eventService: EventService

    private lateinit var mockMvc: MockMvc

    private val eventId: UUID = UUID.randomUUID()
    private val ownerId: UUID = UUID.randomUUID()
    private val participantId: UUID = UUID.randomUUID()
    private val startsAt: Instant = Instant.parse("2026-10-01T18:00:00Z")

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return UUID.randomUUID()
    }

    private fun anyCreateRequest(): CreateEventRequest {
        any(CreateEventRequest::class.java)
        return CreateEventRequest()
    }

    private fun anyUpdateRequest(): UpdateEventRequest {
        any(UpdateEventRequest::class.java)
        return UpdateEventRequest()
    }

    private fun anyAddParticipantRequest(): AddParticipantRequest {
        any(AddParticipantRequest::class.java)
        return AddParticipantRequest()
    }

    private fun sampleEvent() = EventDto(
        id = eventId.toString(),
        title = "Sommerfest",
        description = null,
        location = null,
        startsAt = startsAt,
        endsAt = null,
        status = "draft",
        ownerId = ownerId.toString(),
        ownerDisplayName = "Owner",
        participantCount = 0,
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
    fun `POST events returns 401 when unauthenticated`() {
        mockMvc.perform(
            post("/api/v1/events")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(CreateEventRequest(title = "X", startsAt = startsAt)))
        )
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `POST events creates an event and returns 201`() {
        `when`(eventService.createEvent(anyCreateRequest(), anyPrincipal())).thenReturn(sampleEvent())

        mockMvc.perform(
            post("/api/v1/events")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(CreateEventRequest(title = "Sommerfest", startsAt = startsAt)))
                .with(jwt().jwt { it.subject("sub-owner").claim("realm_access", mapOf("roles" to listOf("member"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").value(eventId.toString()))
            .andExpect(jsonPath("$.title").value("Sommerfest"))
            .andExpect(jsonPath("$.status").value("draft"))
    }

    @Test
    fun `POST events rejects a blank title with 400`() {
        mockMvc.perform(
            post("/api/v1/events")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"\",\"startsAt\":\"2026-10-01T18:00:00Z\"}")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `GET events returns the visible events`() {
        `when`(eventService.listEvents(anyPrincipal())).thenReturn(
            listOf(
                EventSummaryDto(
                    id = eventId.toString(),
                    title = "Sommerfest",
                    status = "draft",
                    startsAt = startsAt,
                    endsAt = null,
                    ownerId = ownerId.toString(),
                    ownerDisplayName = "Owner"
                )
            )
        )

        mockMvc.perform(
            get("/api/v1/events")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(eventId.toString()))
            .andExpect(jsonPath("$[0].title").value("Sommerfest"))
    }

    @Test
    fun `GET event by id returns the event`() {
        `when`(eventService.getEvent(anyUuid(), anyPrincipal())).thenReturn(sampleEvent())

        mockMvc.perform(
            get("/api/v1/events/$eventId")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(eventId.toString()))
    }

    @Test
    fun `GET event by id rejects a syntactically invalid identifier with 400`() {
        mockMvc.perform(
            get("/api/v1/events/not-a-uuid")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("invalid_request"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `PUT event updates the event`() {
        `when`(eventService.updateEvent(anyUuid(), anyUpdateRequest(), anyPrincipal()))
            .thenReturn(sampleEvent().copy(title = "Herbstfest", status = "published"))

        mockMvc.perform(
            put("/api/v1/events/$eventId")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(UpdateEventRequest(title = "Herbstfest", status = "published")))
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.title").value("Herbstfest"))
            .andExpect(jsonPath("$.status").value("published"))
    }

    @Test
    fun `PUT event rejects an invalid status with 400`() {
        mockMvc.perform(
            put("/api/v1/events/$eventId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"bogus\"}")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("validation_failed"))
    }

    @Test
    fun `POST participant adds a participant and returns 201`() {
        `when`(eventService.addParticipant(anyUuid(), anyAddParticipantRequest(), anyPrincipal())).thenReturn(
            EventParticipantDto(
                userId = participantId.toString(),
                displayName = "Participant",
                role = "participant",
                joinedAt = Instant.now()
            )
        )

        mockMvc.perform(
            post("/api/v1/events/$eventId/participants")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(AddParticipantRequest(userId = participantId.toString())))
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.userId").value(participantId.toString()))
            .andExpect(jsonPath("$.role").value("participant"))
    }

    @Test
    fun `DELETE participant returns 204`() {
        mockMvc.perform(
            delete("/api/v1/events/$eventId/participants/$participantId")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isNoContent)
    }
}
