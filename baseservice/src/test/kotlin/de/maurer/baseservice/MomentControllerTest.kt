package de.maurer.baseservice

import com.fasterxml.jackson.databind.ObjectMapper
import de.maurer.baseservice.dto.*
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.MomentService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.isNull
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
class MomentControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @Autowired
    private lateinit var objectMapper: ObjectMapper

    @MockitoBean
    private lateinit var momentService: MomentService

    private lateinit var mockMvc: MockMvc

    private val eventId: UUID = UUID.randomUUID()
    private val momentId: UUID = UUID.randomUUID()
    private val responseId: UUID = UUID.randomUUID()
    private val userId: UUID = UUID.randomUUID()

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "any", roles = emptySet())
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return UUID.randomUUID()
    }

    private fun anyStartRequest(): StartMomentRequest {
        any(StartMomentRequest::class.java)
        return StartMomentRequest(title = "any", topicType = "toast")
    }

    private fun anyResponseRequest(): SubmitMomentResponseRequest {
        any(SubmitMomentResponseRequest::class.java)
        return SubmitMomentResponseRequest(reaction = "any")
    }

    @BeforeEach
    fun setup() {
        mockMvc = MockMvcBuilders
            .webAppContextSetup(context)
            .apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
            .build()
    }

    @Test
    fun `POST startMoment creates a moment session and returns 201`() {
        val sessionDto = MomentSessionDto(
            id = momentId.toString(),
            eventId = eventId.toString(),
            creatorId = userId.toString(),
            creatorName = "Max Mustermann",
            conversationId = UUID.randomUUID().toString(),
            title = "Gemeinsames Anstoßen",
            topicType = "toast",
            message = "Prost!",
            latitude = 48.137,
            longitude = 11.575,
            active = true,
            responsesCount = 0,
            expiresAt = Instant.now().plusSeconds(3600),
            createdAt = Instant.now()
        )

        `when`(momentService.startMoment(anyStartRequest(), anyPrincipal())).thenReturn(sessionDto)

        val request = StartMomentRequest(
            title = "Gemeinsames Anstoßen",
            topicType = "toast",
            message = "Prost!",
            consent = true,
            latitude = 48.137,
            longitude = 11.575,
            durationMinutes = 60
        )

        mockMvc.perform(
            post("/api/v1/moments")
                .with(jwt().jwt { it.subject("sub-user") })
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").value(momentId.toString()))
            .andExpect(jsonPath("$.title").value("Gemeinsames Anstoßen"))
            .andExpect(jsonPath("$.topicType").value("toast"))
            .andExpect(jsonPath("$.active").value(true))
            .andExpect(jsonPath("$.latitude").value(48.137))
            .andExpect(jsonPath("$.longitude").value(11.575))
    }

    @Test
    fun `GET listActiveMoments returns active sessions with 200`() {
        val sessionDto = MomentSessionDto(
            id = momentId.toString(),
            eventId = eventId.toString(),
            creatorId = userId.toString(),
            creatorName = "Max Mustermann",
            conversationId = null,
            title = "Gebetskreis",
            topicType = "prayer",
            message = null,
            latitude = null,
            longitude = null,
            active = true,
            responsesCount = 3,
            expiresAt = Instant.now().plusSeconds(1800),
            createdAt = Instant.now()
        )

        `when`(momentService.listActiveMoments(anyPrincipal(), isNull())).thenReturn(listOf(sessionDto))

        mockMvc.perform(
            get("/api/v1/moments")
                .with(jwt().jwt { it.subject("sub-user") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(momentId.toString()))
            .andExpect(jsonPath("$[0].title").value("Gebetskreis"))
            .andExpect(jsonPath("$[0].responsesCount").value(3))
    }

    @Test
    fun `GET getMomentDetail returns session, response stream, and GeoJSON with 200`() {
        val sessionDto = MomentSessionDto(
            id = momentId.toString(),
            eventId = eventId.toString(),
            creatorId = userId.toString(),
            creatorName = "Max",
            conversationId = null,
            title = "Jubeln",
            topicType = "cheer",
            message = null,
            latitude = 50.0,
            longitude = 10.0,
            active = true,
            responsesCount = 1,
            expiresAt = Instant.now().plusSeconds(3600),
            createdAt = Instant.now()
        )

        val responseDto = MomentResponseDto(
            id = responseId.toString(),
            momentId = momentId.toString(),
            userId = userId.toString(),
            userName = "Erika",
            reaction = "CHEER",
            statusText = "Super Tor!",
            latitude = 50.1,
            longitude = 10.1,
            createdAt = Instant.now()
        )

        val geoJson = MomentMapGeoJsonDto(
            type = "FeatureCollection",
            features = listOf(
                GeoJsonFeatureDto(
                    type = "Feature",
                    geometry = GeoJsonGeometryDto(type = "Point", coordinates = listOf(10.0, 50.0)),
                    properties = mapOf("title" to "Jubeln")
                )
            )
        )

        val detailDto = MomentDetailDto(
            session = sessionDto,
            responses = listOf(responseDto),
            mapGeoJson = geoJson
        )

        `when`(momentService.getMomentDetail(anyUuid(), anyPrincipal())).thenReturn(detailDto)

        mockMvc.perform(
            get("/api/v1/moments/$momentId")
                .with(jwt().jwt { it.subject("sub-user") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.session.id").value(momentId.toString()))
            .andExpect(jsonPath("$.responses[0].reaction").value("CHEER"))
            .andExpect(jsonPath("$.responses[0].statusText").value("Super Tor!"))
            .andExpect(jsonPath("$.mapGeoJson.type").value("FeatureCollection"))
            .andExpect(jsonPath("$.mapGeoJson.features[0].geometry.type").value("Point"))
    }

    @Test
    fun `POST submitResponse saves response and returns 201`() {
        val responseDto = MomentResponseDto(
            id = responseId.toString(),
            momentId = momentId.toString(),
            userId = userId.toString(),
            userName = "Max",
            reaction = "TOAST",
            statusText = "Prost!",
            latitude = 48.0,
            longitude = 11.0,
            createdAt = Instant.now()
        )

        `when`(momentService.submitResponse(anyUuid(), anyResponseRequest(), anyPrincipal())).thenReturn(responseDto)

        val request = SubmitMomentResponseRequest(
            reaction = "TOAST",
            statusText = "Prost!",
            consent = true,
            latitude = 48.0,
            longitude = 11.0
        )

        mockMvc.perform(
            post("/api/v1/moments/$momentId/responses")
                .with(jwt().jwt { it.subject("sub-user") })
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").value(responseId.toString()))
            .andExpect(jsonPath("$.reaction").value("TOAST"))
            .andExpect(jsonPath("$.statusText").value("Prost!"))
    }

    @Test
    fun `GET getMomentMap returns GeoJSON FeatureCollection with 200`() {
        val geoJson = MomentMapGeoJsonDto(
            type = "FeatureCollection",
            features = listOf(
                GeoJsonFeatureDto(
                    geometry = GeoJsonGeometryDto(coordinates = listOf(11.575, 48.137)),
                    properties = mapOf("reaction" to "CHEERS", "userName" to "Max")
                )
            )
        )

        `when`(momentService.getMomentMapGeoJson(anyUuid(), anyPrincipal())).thenReturn(geoJson)

        mockMvc.perform(
            get("/api/v1/moments/$momentId/map")
                .with(jwt().jwt { it.subject("sub-user") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.type").value("FeatureCollection"))
            .andExpect(jsonPath("$.features[0].geometry.coordinates[0]").value(11.575))
            .andExpect(jsonPath("$.features[0].geometry.coordinates[1]").value(48.137))
            .andExpect(jsonPath("$.features[0].properties.reaction").value("CHEERS"))
    }

    @Test
    fun `POST completeMoment completes session and returns summary with 200`() {
        val summaryDto = MomentSummaryDto(
            momentId = momentId.toString(),
            title = "Anstoßen",
            topicType = "toast",
            totalResponses = 5,
            uniqueParticipants = 4,
            summary = "4 Teilnehmer haben 5 Statusbeiträge geteilt.",
            completedAt = Instant.now()
        )

        `when`(momentService.completeMoment(anyUuid(), anyPrincipal())).thenReturn(summaryDto)

        mockMvc.perform(
            post("/api/v1/moments/$momentId/complete")
                .with(jwt().jwt { it.subject("sub-user") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.momentId").value(momentId.toString()))
            .andExpect(jsonPath("$.title").value("Anstoßen"))
            .andExpect(jsonPath("$.totalResponses").value(5))
            .andExpect(jsonPath("$.uniqueParticipants").value(4))
            .andExpect(jsonPath("$.summary").value("4 Teilnehmer haben 5 Statusbeiträge geteilt."))
    }

    @Test
    fun `GET listMomentHistory returns historical moments with 200`() {
        val summaryDto = MomentSummaryDto(
            momentId = momentId.toString(),
            title = "Vergangener Moment",
            topicType = "prayer",
            totalResponses = 10,
            uniqueParticipants = 8,
            summary = "8 Teilnehmer haben 10 Statusbeiträge geteilt.",
            completedAt = Instant.now()
        )

        `when`(momentService.listMomentHistory(anyPrincipal(), isNull())).thenReturn(listOf(summaryDto))

        mockMvc.perform(
            get("/api/v1/moments/history")
                .with(jwt().jwt { it.subject("sub-user") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].momentId").value(momentId.toString()))
            .andExpect(jsonPath("$[0].title").value("Vergangener Moment"))
    }

    @Test
    fun `invalid UUID path parameters reject with 400 and problem detail`() {
        mockMvc.perform(
            get("/api/v1/moments/invalid-uuid")
                .with(jwt().jwt { it.subject("sub-user") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value(ErrorCode.INVALID_REQUEST))
    }

    @Test
    fun `invalid request body rejected with 400`() {
        val badRequest = StartMomentRequest(
            topicType = "" // Thema ist Pflicht
        )

        mockMvc.perform(
            post("/api/v1/moments")
                .with(jwt().jwt { it.subject("sub-user") })
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(badRequest))
        )
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `parseRange understands single byte ranges and rejects unsatisfiable ones`() {
        assertEquals(0L to 99L, de.maurer.baseservice.controller.MomentController.parseRange("bytes=0-99", 1000))
        assertEquals(500L to 999L, de.maurer.baseservice.controller.MomentController.parseRange("bytes=500-", 1000))
        assertEquals(900L to 999L, de.maurer.baseservice.controller.MomentController.parseRange("bytes=-100", 1000))
        assertEquals(990L to 999L, de.maurer.baseservice.controller.MomentController.parseRange("bytes=990-5000", 1000))
        assertEquals(null, de.maurer.baseservice.controller.MomentController.parseRange(null, 1000))
        assertEquals(null, de.maurer.baseservice.controller.MomentController.parseRange("bytes=0-1,5-6", 1000))
        assertEquals(-1L to -1L, de.maurer.baseservice.controller.MomentController.parseRange("bytes=1000-", 1000))
    }
}
