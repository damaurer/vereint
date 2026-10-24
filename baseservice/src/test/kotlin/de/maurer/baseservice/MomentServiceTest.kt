package de.maurer.baseservice

import de.maurer.baseservice.domain.*
import de.maurer.baseservice.dto.StartMomentRequest
import de.maurer.baseservice.dto.SubmitMomentResponseRequest
import de.maurer.baseservice.error.*
import de.maurer.baseservice.repository.*
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.AuditService
import de.maurer.baseservice.service.ChatService
import de.maurer.baseservice.service.MomentAccessPolicy
import de.maurer.baseservice.service.MomentConfigService
import de.maurer.baseservice.service.MomentLabels
import de.maurer.baseservice.service.MomentService
import de.maurer.baseservice.service.NotificationService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.support.StammtischTestSupport
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.eq
import org.mockito.ArgumentMatchers.isNull
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.junit.jupiter.MockitoSettings
import org.mockito.quality.Strictness
import java.time.Instant
import java.util.*

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MomentServiceTest {

    @Mock
    private lateinit var momentSessionRepository: MomentSessionRepository

    @Mock
    private lateinit var momentResponseRepository: MomentResponseRepository

    @Mock
    private lateinit var eventRepository: EventRepository

    @Mock
    private lateinit var eventParticipantRepository: EventParticipantRepository

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var userService: UserService

    @Mock
    private lateinit var stammtischMemberRepository: StammtischMemberRepository

    @Mock
    private lateinit var chatService: ChatService

    @Mock
    private lateinit var notificationService: NotificationService

    @Mock
    private lateinit var auditService: AuditService

    @Mock
    private lateinit var momentConfigService: MomentConfigService

    @Mock
    private lateinit var momentMediaRepository: MomentMediaRepository

    private lateinit var momentService: MomentService

    private val eventId: UUID = UUID.randomUUID()
    private val momentId: UUID = UUID.randomUUID()
    private val ownerId: UUID = UUID.randomUUID()
    private val participantId: UUID = UUID.randomUUID()
    private val otherUserId: UUID = UUID.randomUUID()

    private val ownerPrincipal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
    private val participantPrincipal = UserPrincipal(subject = "sub-part", roles = setOf(UserRole.MEMBER))
    private val otherPrincipal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
    private val boardPrincipal = UserPrincipal(subject = "sub-board", roles = setOf(UserRole.BOARD))

    private val ownerUser = UserEntity(id = ownerId, displayName = "Owner", keycloakSubject = "sub-owner")
    private val participantUser = UserEntity(id = participantId, displayName = "Teilnehmer", keycloakSubject = "sub-part")
    private val otherUser = UserEntity(id = otherUserId, displayName = "Fremder", keycloakSubject = "sub-other")
    private val boardUser = UserEntity(id = UUID.randomUUID(), displayName = "Vorstand", keycloakSubject = "sub-board")

    private fun user(id: UUID, name: String) = UserEntity(id = id, displayName = name, keycloakSubject = "sub-$id")
    private fun event(status: EventStatus = EventStatus.published, owner: UserEntity = ownerUser) =
        EventEntity(id = eventId, title = "Vereinsfest", status = status, owner = owner)

    private fun <T> anyNonNull(default: T): T = any() ?: default

    @BeforeEach
    fun setup() {
        momentService = MomentService(
            momentSessionRepository = momentSessionRepository,
            momentResponseRepository = momentResponseRepository,
            eventRepository = eventRepository,
            eventParticipantRepository = eventParticipantRepository,
            stammtischMemberRepository = stammtischMemberRepository,
            policy = MomentAccessPolicy(eventParticipantRepository, StammtischTestSupport.access(userRoleRepository)),
            userService = userService,
            chatService = chatService,
            notificationService = notificationService,
            auditService = auditService,
            momentConfigService = momentConfigService,
            momentMediaRepository = momentMediaRepository
        )
        `when`(momentConfigService.labels()).thenReturn(
            MomentLabels(
                types = mapOf("toast" to ("Gemeinsames Anstoßen" to "🍻"), "prayer" to ("Gebet & Fürbitte" to "🙏")),
                reactions = mapOf("CHEERS" to ("Prost" to "🍻"))
            )
        )

        `when`(userService.getOrCreateUser(ownerPrincipal)).thenReturn(ownerUser)
        `when`(userService.getOrCreateUser(participantPrincipal)).thenReturn(participantUser)
        `when`(userService.getOrCreateUser(otherPrincipal)).thenReturn(otherUser)
        `when`(userService.getOrCreateUser(boardPrincipal)).thenReturn(boardUser)

        `when`(momentSessionRepository.save(any(MomentSessionEntity::class.java) ?: MomentSessionEntity())).thenAnswer { it.arguments[0] }
        `when`(momentResponseRepository.save(any(MomentResponseEntity::class.java) ?: MomentResponseEntity())).thenAnswer { it.arguments[0] }
    }

    @Test
    fun `startMoment successfully creates session, 24h conversation, push notifications, and audit log`() {
        val ev = event()
        val caller = participantUser
        val otherPart = otherUser
        val conversationId = UUID.randomUUID()
        val conversation = ConversationEntity(
            id = conversationId,
            type = "moment",
            event = ev,
            title = "Moment: Anstoßen",
            expiresAt = Instant.now().plusSeconds(86400)
        )

        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = caller)))
        `when`(eventParticipantRepository.findByEventId(eventId))
            .thenReturn(listOf(
                EventParticipantEntity(event = ev, user = caller),
                EventParticipantEntity(event = ev, user = otherPart)
            ))
        `when`(chatService.createMomentConversation(any(EventEntity::class.java) ?: ev, anyString())).thenReturn(conversation)

        val request = StartMomentRequest(
            title = "Gemeinsames Anstoßen",
            topicType = "toast",
            message = "Auf das Vereinsjubiläum!",
            consent = true,
            latitude = 48.137,
            longitude = 11.575,
            durationMinutes = 60,
            visibility = "event"
        )

        val result = momentService.startMoment(request.copy(eventId = eventId.toString()), participantPrincipal)

        assertNotNull(result)
        assertEquals("Gemeinsames Anstoßen", result.title)
        assertEquals("toast", result.topicType)
        assertEquals("Auf das Vereinsjubiläum!", result.message)
        assertEquals(48.137, result.latitude)
        assertEquals(11.575, result.longitude)
        assertTrue(result.active)
        assertEquals(conversationId.toString(), result.conversationId)

        verify(momentSessionRepository).save(any(MomentSessionEntity::class.java) ?: MomentSessionEntity())
        verify(chatService).createMomentConversation(any(EventEntity::class.java) ?: ev, eq("Gemeinsames Anstoßen") ?: "Gemeinsames Anstoßen")
        verify(notificationService).notifyUsers(anyCollection(), anyString(), anyString(), eq("moment") ?: "moment", isNull())
        verify(auditService).recordMomentAction(
            eq(caller) ?: caller,
            eq(AuditService.ACTION_MOMENT_STARTED) ?: "",
            any(UUID::class.java) ?: UUID.randomUUID(),
            anyString()
        )
    }

    @Test
    fun `startMoment rejects unauthenticated non-participant access with ACCESS_DENIED`() {
        val ev = event()
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherUserId)).thenReturn(Optional.empty())

        val request = StartMomentRequest(title = "Gebetskreis", topicType = "prayer")

        val ex = assertThrows(AccessDeniedException::class.java) {
            momentService.startMoment(request.copy(eventId = eventId.toString()), otherPrincipal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `startMoment rejects inactive or cancelled event with EVENT_NOT_ACTIVE`() {
        val ev = event(status = EventStatus.cancelled)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = user(participantId, "Teilnehmer"))))

        val request = StartMomentRequest(title = "Anfeuern", topicType = "cheer")

        val ex = assertThrows(EventNotActiveException::class.java) {
            momentService.startMoment(request.copy(eventId = eventId.toString()), participantPrincipal)
        }
        assertEquals(ErrorCode.EVENT_NOT_ACTIVE, ex.errorCode)
    }

    @Test
    fun `startMoment requires consent when coordinates are provided`() {
        val ev = event()
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = user(participantId, "Teilnehmer"))))

        val request = StartMomentRequest(
            title = "Check-in",
            topicType = "checkin",
            consent = false,
            latitude = 50.0,
            longitude = 8.0
        )

        val ex = assertThrows(ConsentRequiredException::class.java) {
            momentService.startMoment(request.copy(eventId = eventId.toString()), participantPrincipal)
        }
        assertEquals(ErrorCode.CONSENT_REQUIRED, ex.errorCode)
    }

    @Test
    fun `startMoment rejects incomplete coordinates`() {
        val ev = event()
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = user(participantId, "Teilnehmer"))))

        val request = StartMomentRequest(
            title = "Check-in",
            topicType = "checkin",
            consent = true,
            latitude = 50.0,
            longitude = null
        )

        val ex = assertThrows(InvalidRequestException::class.java) {
            momentService.startMoment(request.copy(eventId = eventId.toString()), participantPrincipal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `submitResponse allows multiple progressive status updates from the same participant`() {
        val ev = event()
        val caller = user(participantId, "Teilnehmer")
        val session = MomentSessionEntity(
            id = momentId,
            event = ev,
            creator = caller,
            title = "Anstoßen",
            topicType = "toast",
            active = true,
            expiresAt = Instant.now().plusSeconds(3600)
        )

        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = caller)))
        `when`(momentSessionRepository.findById(momentId)).thenReturn(Optional.of(session))

        val firstReq = SubmitMomentResponseRequest(
            reaction = "CHEERS",
            statusText = "Prost zusammen!",
            consent = true,
            latitude = 48.13,
            longitude = 11.57
        )
        val firstResp = momentService.submitResponse(momentId, firstReq, participantPrincipal)
        assertEquals("CHEERS", firstResp.reaction)
        assertEquals("Prost zusammen!", firstResp.statusText)
        assertEquals(48.13, firstResp.latitude)

        val secondReq = SubmitMomentResponseRequest(
            reaction = "CHEERS",
            statusText = "Noch eine Runde!",
            consent = false
        )
        val secondResp = momentService.submitResponse(momentId, secondReq, participantPrincipal)
        assertEquals("CHEERS", secondResp.reaction)
        assertEquals("Noch eine Runde!", secondResp.statusText)
        assertNull(secondResp.latitude)

        verify(momentResponseRepository, times(2)).save(any(MomentResponseEntity::class.java))
    }

    @Test
    fun `submitResponse to expired moment automatically completes it and throws INVALID_REQUEST`() {
        val ev = event()
        val caller = user(participantId, "Teilnehmer")
        val session = MomentSessionEntity(
            id = momentId,
            event = ev,
            creator = caller,
            title = "Gebet",
            topicType = "prayer",
            active = true,
            expiresAt = Instant.now().minusSeconds(10)
        )

        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = caller)))
        `when`(momentSessionRepository.findById(momentId)).thenReturn(Optional.of(session))
        `when`(momentResponseRepository.findByMomentIdOrderByCreatedAtAsc(momentId)).thenReturn(emptyList())

        val req = SubmitMomentResponseRequest(reaction = "AMEN")

        val ex = assertThrows(InvalidRequestException::class.java) {
            momentService.submitResponse(momentId, req, participantPrincipal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
        assertFalse(session.active)
        assertNotNull(session.completedAt)
    }

    @Test
    fun `getMomentDetail returns session, chronological responses, and GeoJSON collection`() {
        val ev = event()
        val creator = user(ownerId, "Owner")
        val participant = user(participantId, "Teilnehmer")
        val session = MomentSessionEntity(
            id = momentId,
            event = ev,
            creator = creator,
            title = "Torjubel",
            topicType = "cheer",
            latitude = 52.52,
            longitude = 13.405,
            active = true,
            expiresAt = Instant.now().plusSeconds(1800)
        )

        val response1 = MomentResponseEntity(
            id = UUID.randomUUID(),
            moment = session,
            user = participant,
            reaction = "GOAL",
            statusText = "Tooor!",
            latitude = 52.53,
            longitude = 13.41
        )
        val response2 = MomentResponseEntity(
            id = UUID.randomUUID(),
            moment = session,
            user = participant,
            reaction = "CELEBRATE",
            statusText = "Wahnsinn!",
            latitude = null,
            longitude = null
        )

        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = participant)))
        `when`(momentSessionRepository.findById(momentId)).thenReturn(Optional.of(session))
        `when`(momentResponseRepository.findByMomentIdOrderByCreatedAtAsc(momentId))
            .thenReturn(listOf(response1, response2))

        val detail = momentService.getMomentDetail(momentId, participantPrincipal)

        assertEquals("Torjubel", detail.session.title)
        assertEquals(2, detail.session.responsesCount)
        assertEquals(2, detail.responses.size)
        assertEquals("Tooor!", detail.responses[0].statusText)
        assertEquals("Wahnsinn!", detail.responses[1].statusText)

        // GeoJSON FeatureCollection should include session pin and consented response pin
        assertEquals("FeatureCollection", detail.mapGeoJson.type)
        assertEquals(2, detail.mapGeoJson.features.size)
        assertEquals("Point", detail.mapGeoJson.features[0].geometry.type)
        assertEquals(listOf(13.405, 52.52), detail.mapGeoJson.features[0].geometry.coordinates)
        assertEquals(listOf(13.41, 52.53), detail.mapGeoJson.features[1].geometry.coordinates)
    }

    @Test
    fun `completeMoment transitions active session to completed and generates calendar summary`() {
        val ev = event()
        val creator = participantUser
        val session = MomentSessionEntity(
            id = momentId,
            event = ev,
            creator = creator,
            title = "Abendandacht",
            topicType = "prayer",
            active = true,
            expiresAt = Instant.now().plusSeconds(3600)
        )

        val r1 = MomentResponseEntity(id = UUID.randomUUID(), moment = session, user = creator, reaction = "AMEN")
        val r2 = MomentResponseEntity(id = UUID.randomUUID(), moment = session, user = otherUser, reaction = "PRAY")

        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = creator)))
        `when`(momentSessionRepository.findById(momentId)).thenReturn(Optional.of(session))
        `when`(momentResponseRepository.findByMomentIdOrderByCreatedAtAsc(momentId)).thenReturn(listOf(r1, r2))
        `when`(momentResponseRepository.findByMomentId(momentId)).thenReturn(listOf(r1, r2))

        val summary = momentService.completeMoment(momentId, participantPrincipal)

        assertNotNull(summary)
        assertEquals(momentId.toString(), summary.momentId)
        assertEquals("Abendandacht", summary.title)
        assertEquals(2, summary.totalResponses)
        assertEquals(2, summary.uniqueParticipants)
        assertNotNull(summary.summary)
        assertTrue(summary.summary!!.contains("2 Teilnehmer haben 2 Statusbeiträge"))
        assertFalse(session.active)
        assertNotNull(session.completedAt)

        verify(auditService).recordMomentAction(
            eq(creator) ?: creator,
            eq(AuditService.ACTION_MOMENT_COMPLETED) ?: "",
            eq(momentId) ?: momentId,
            anyString()
        )
    }

    @Test
    fun `completeMoment denies unauthorized members from completing other users moments`() {
        val ev = event()
        val creator = user(ownerId, "Owner")
        val session = MomentSessionEntity(
            id = momentId,
            event = ev,
            creator = creator,
            title = "Anstoßen",
            topicType = "toast",
            active = true
        )

        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = user(participantId, "Teilnehmer"))))
        `when`(momentSessionRepository.findById(momentId)).thenReturn(Optional.of(session))

        val ex = assertThrows(AccessDeniedException::class.java) {
            momentService.completeMoment(momentId, participantPrincipal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `listMomentHistory lists only finished moments and always carries a completion time`() {
        val ev = event()
        val expiresAt = Instant.now().minusSeconds(7200)
        val running = MomentSessionEntity(
            id = UUID.randomUUID(), event = ev, creator = ownerUser, title = "Läuft noch", topicType = "toast",
            active = true, expiresAt = Instant.now().plusSeconds(3600)
        )
        val legacy = MomentSessionEntity(
            id = momentId, event = ev, creator = ownerUser, title = "Alt", topicType = "toast",
            active = false, expiresAt = expiresAt, completedAt = null, summary = "fertig"
        )

        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(momentSessionRepository.findByEventIdOrderByCreatedAtDesc(eventId)).thenReturn(listOf(running, legacy))
        `when`(momentResponseRepository.findByMomentId(any(UUID::class.java) ?: momentId)).thenReturn(emptyList())

        val history = momentService.listMomentHistory(ownerPrincipal, eventId)

        assertEquals(listOf(momentId.toString()), history.map { it.momentId })
        assertEquals(expiresAt, history.single().completedAt)
    }

    private fun activeSession(caller: UserEntity, topicType: String = "toast") = MomentSessionEntity(
        id = momentId,
        event = event(),
        creator = caller,
        title = "Anstoßen",
        topicType = topicType,
        active = true,
        expiresAt = Instant.now().plusSeconds(3600)
    )

    private fun participantCanAccess(session: MomentSessionEntity) {
        val ev = session.event!!
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = participantUser)))
        `when`(momentSessionRepository.findById(momentId)).thenReturn(Optional.of(session))
    }

    @Test
    fun `startMoment rejects a retired or unknown moment type`() {
        val ev = event()
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = participantUser)))
        `when`(momentConfigService.requireActiveType("retired"))
            .thenThrow(InvalidRequestException(Msg("error.momentType.notAvailable"), ErrorCode.INVALID_REQUEST))

        assertThrows(InvalidRequestException::class.java) {
            momentService.startMoment(StartMomentRequest(title = "Alt", topicType = "retired", eventId = eventId.toString()), participantPrincipal)
        }
        verify(momentSessionRepository, never()).save(any(MomentSessionEntity::class.java))
    }

    @Test
    fun `startMoment returns the type name and emoji the board defined`() {
        val ev = event()
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.of(ev))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, participantId))
            .thenReturn(Optional.of(EventParticipantEntity(event = ev, user = participantUser)))
        val result = momentService.startMoment(StartMomentRequest(title = "Prost", topicType = "toast", eventId = eventId.toString()), participantPrincipal)

        verify(momentConfigService).requireActiveType("toast")
        assertEquals("Gemeinsames Anstoßen", result.topicName)
        assertEquals("🍻", result.topicEmoji)
    }

    @Test
    fun `submitResponse checks that the reaction is allowed for the moment type`() {
        participantCanAccess(activeSession(participantUser, topicType = "prayer"))
        `when`(momentConfigService.requireAllowedReaction("prayer", "CHEERS"))
            .thenThrow(InvalidRequestException(Msg("error.momentReaction.notAllowedForType"), ErrorCode.INVALID_REQUEST))

        assertThrows(InvalidRequestException::class.java) {
            momentService.submitResponse(momentId, SubmitMomentResponseRequest(reaction = "CHEERS"), participantPrincipal)
        }
        verify(momentResponseRepository, never()).save(any(MomentResponseEntity::class.java))
    }

    @Test
    fun `submitResponse rejects a contribution without reaction, text or media`() {
        participantCanAccess(activeSession(participantUser))

        val ex = assertThrows(InvalidRequestException::class.java) {
            momentService.submitResponse(momentId, SubmitMomentResponseRequest(statusText = "  "), participantPrincipal)
        }
        assertEquals("error.moment.emptyResponse", ex.messageKey)
    }

    @Test
    fun `submitResponse attaches own unused uploads and returns them with the response`() {
        val session = activeSession(participantUser)
        participantCanAccess(session)
        val media = MomentMediaEntity(
            moment = session,
            owner = participantUser,
            kind = MomentMediaKind.video,
            contentType = "video/mp4",
            sizeBytes = 1234,
            storageKey = "moment/x.bin",
            durationMs = 12_000
        )
        `when`(momentMediaRepository.findAllById(listOf(media.id))).thenReturn(listOf(media))

        val result = momentService.submitResponse(
            momentId,
            SubmitMomentResponseRequest(mediaIds = listOf(media.id.toString())),
            participantPrincipal
        )

        assertNull(result.reaction)
        assertEquals(1, result.media.size)
        assertEquals("video", result.media[0].kind)
        assertEquals(12.0, result.media[0].durationSeconds)
        assertEquals("/api/v1/moments/$momentId/media/${media.id}/content", result.media[0].url)
        assertTrue(result.media[0].canDelete)
        assertNotNull(media.response)
        verify(momentMediaRepository).save(media)
    }

    @Test
    fun `submitResponse refuses media uploaded by someone else`() {
        val session = activeSession(participantUser)
        participantCanAccess(session)
        val foreign = MomentMediaEntity(
            moment = session,
            owner = otherUser,
            kind = MomentMediaKind.image,
            contentType = "image/jpeg",
            sizeBytes = 10,
            storageKey = "moment/y.bin"
        )
        `when`(momentMediaRepository.findAllById(listOf(foreign.id))).thenReturn(listOf(foreign))

        val ex = assertThrows(InvalidRequestException::class.java) {
            momentService.submitResponse(
                momentId,
                SubmitMomentResponseRequest(reaction = "CHEERS", mediaIds = listOf(foreign.id.toString())),
                participantPrincipal
            )
        }
        assertEquals("error.momentMedia.notUsable", ex.messageKey)
        assertNull(foreign.response)
    }
    @Test
    fun `startMoment without an event notifies the whole group and takes the topic name as title`() {
        `when`(momentConfigService.requireActiveType("toast"))
            .thenReturn(MomentTypeEntity(code = "toast", name = "Gemeinsames Anstoßen", emoji = "🍻"))
        `when`(stammtischMemberRepository.findByActiveTrue()).thenReturn(
            listOf(participantUser, otherUser, ownerUser).map { StammtischMemberEntity(user = it) }
        )

        val result = momentService.startMoment(StartMomentRequest(topicType = "toast"), participantPrincipal)

        assertNull(result.eventId)
        assertEquals("group", result.visibility)
        assertEquals("Gemeinsames Anstoßen", result.title)
        verify(chatService).createMomentConversation(isNull(), eq("Gemeinsames Anstoßen") ?: "")
        verify(notificationService).notifyUsers(
            eq(listOf(otherUser, ownerUser)) ?: emptyList(), anyString(), anyString(), eq("moment") ?: "moment", isNull()
        )
    }

    @Test
    fun `startMoment limited to event participants needs an event`() {
        val ex = assertThrows(InvalidRequestException::class.java) {
            momentService.startMoment(StartMomentRequest(topicType = "toast", visibility = "event"), participantPrincipal)
        }
        assertEquals("error.moment.visibilityRequiresEvent", ex.messageKey)
    }

    @Test
    fun `group moments of an event are visible to every member, event-only moments only to participants`() {
        val groupMoment = activeSession(ownerUser)
        `when`(momentSessionRepository.findById(momentId)).thenReturn(Optional.of(groupMoment))
        `when`(eventParticipantRepository.findByEventIdAndUserId(eventId, otherUserId)).thenReturn(Optional.empty())

        assertEquals(momentId.toString(), momentService.getMomentDetail(momentId, otherPrincipal).session.id)

        groupMoment.visibility = MomentVisibility.event
        assertThrows(AccessDeniedException::class.java) {
            momentService.getMomentDetail(momentId, otherPrincipal)
        }
    }
}
