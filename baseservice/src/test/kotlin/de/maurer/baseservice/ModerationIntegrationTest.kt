package de.maurer.baseservice

import de.maurer.baseservice.dto.CreateReportRequest
import de.maurer.baseservice.dto.ResolveReportRequest
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.dto.StartMomentRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.live.LiveUpdateHub
import de.maurer.baseservice.push.PushDispatcher
import de.maurer.baseservice.repository.ChatMessageRepository
import de.maurer.baseservice.repository.DirectMessageRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.BlockService
import de.maurer.baseservice.service.ConversationService
import de.maurer.baseservice.service.DirectMessageService
import de.maurer.baseservice.service.FriendService
import de.maurer.baseservice.service.MomentService
import de.maurer.baseservice.service.ReportService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.tenancy.TenantContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import java.util.UUID

/**
 * Melden und Blockieren (#153) gegen H2 mit den echten Migrationen. Alle
 * Personen sind Mitglied der Standardgruppe der Tests.
 */
@SpringBootTest
@ActiveProfiles("test")
class ModerationIntegrationTest @Autowired constructor(
    private val blockService: BlockService,
    private val reportService: ReportService,
    private val conversationService: ConversationService,
    private val directMessageService: DirectMessageService,
    private val friendService: FriendService,
    private val momentService: MomentService,
    private val userService: UserService,
    private val chatMessageRepository: ChatMessageRepository,
    private val directMessageRepository: DirectMessageRepository
) {

    /** Gleiche Overrides wie [PersonalNetworkIntegrationTest], damit beide einen Spring-Kontext teilen. */
    @MockitoSpyBean
    private lateinit var pushDispatcher: PushDispatcher

    @MockitoSpyBean
    private lateinit var liveUpdateHub: LiveUpdateHub

    private fun person(name: String, vararg roles: String = arrayOf(UserRole.MEMBER)) =
        UserPrincipal(subject = "kc-$name-${UUID.randomUUID()}", displayName = name, roles = roles.toSet())
            .also { userService.getOrCreateUser(it) }

    private fun idOf(principal: UserPrincipal) = userService.getOrCreateUser(principal).id

    private fun pushedTo(userId: UUID): Boolean =
        Mockito.mockingDetails(pushDispatcher).invocations
            .any { it.method.name == "dispatch" && (it.arguments[0] as Collection<*>).contains(userId) }

    @Test
    fun `blocking hides content, stops pushes and direct messages in both directions`() {
        val alice = person("Alice")
        val bob = person("Bob")
        val carol = person("Carol")
        val aliceId = idOf(alice)
        val bobId = idOf(bob)
        val club = UUID.fromString(conversationService.clubSummary(alice).id)
        val direct = UUID.fromString(directMessageService.start(bobId.toString(), alice).id)
        directMessageService.send(direct, SendMessageRequest(message = "Hallo Bob"), alice)
        friendService.request(bobId.toString(), alice)
        friendService.accept(aliceId.toString(), bob)

        blockService.block(bobId.toString(), alice)
        assertEquals(listOf("Bob"), blockService.list(alice).map { it.displayName })
        // Die Freundschaft endet, Bob taucht nicht mehr als Kontakt auf.
        assertTrue(friendService.overview(alice).friends.isEmpty())
        assertTrue(friendService.contacts(alice).none { it.userId == bobId.toString() })
        assertFalse(friendService.contacts(bob).single { it.userId == aliceId.toString() }.canMessage)

        Mockito.clearInvocations(pushDispatcher)
        val fromBob = conversationService.sendMessage(club, SendMessageRequest(message = "Bob schreibt"), bob)
        assertFalse(pushedTo(aliceId))
        assertTrue(conversationService.listMessages(club, alice).none { it.id == fromBob.id })
        assertTrue(conversationService.listMessages(club, carol).any { it.id == fromBob.id })
        assertTrue(conversationService.clubSummary(alice).lastMessage?.message != "Bob schreibt")

        // Direktnachrichten: Bob kann nicht schreiben, Alice auch nicht, der Chat ist aus Alices Liste weg.
        assertThrows<AccessDeniedException> { directMessageService.send(direct, SendMessageRequest(message = "Hi"), bob) }
        assertThrows<AccessDeniedException> { directMessageService.send(direct, SendMessageRequest(message = "Hi"), alice) }
        assertTrue(directMessageService.list(alice).none { it.id == direct.toString() })
        assertThrows<ResourceNotFoundException> { friendService.request(aliceId.toString(), bob) }

        // Moments von Bob sieht Alice nicht.
        val moment = momentService.startMoment(StartMomentRequest(title = "Prost", topicType = "toast", visibility = "group"), bob)
        assertTrue(momentService.listActiveMoments(alice).none { it.id == moment.id })
        assertTrue(momentService.listActiveMoments(carol).any { it.id == moment.id })

        blockService.unblock(bobId.toString(), alice)
        assertTrue(conversationService.listMessages(club, alice).any { it.id == fromBob.id })
        directMessageService.send(direct, SendMessageRequest(message = "Wieder da"), bob)
        assertThrows<InvalidRequestException> { blockService.block(aliceId.toString(), alice) }
    }

    @Test
    fun `group reports go to moderators who can remove the content`() {
        val author = person("Autor")
        val reporter = person("Melderin")
        val board = person("Vorstand", UserRole.BOARD)
        val club = UUID.fromString(conversationService.clubSummary(author).id)
        val message = conversationService.sendMessage(club, SendMessageRequest(message = "Spam!"), author)
        val messageId = UUID.fromString(message.id)

        assertThrows<InvalidRequestException> {
            reportService.reportChatMessage(club, messageId, CreateReportRequest(reason = "spam"), author)
        }
        assertThrows<InvalidRequestException> {
            reportService.reportChatMessage(club, messageId, CreateReportRequest(reason = "boring"), reporter)
        }
        val created = reportService.reportChatMessage(club, messageId, CreateReportRequest(reason = "spam", note = "Werbung"), reporter)
        assertEquals("group", created.handledBy)
        // Doppelt melden legt keine zweite offene Meldung an.
        reportService.reportChatMessage(club, messageId, CreateReportRequest(reason = "spam"), reporter)

        assertThrows<AccessDeniedException> { reportService.groupReports(reporter, includeResolved = false) }
        assertEquals(0, reportService.openGroupReportCount(reporter))
        val open = reportService.groupReports(board, includeResolved = false).filter { it.targetId == message.id }
        assertEquals(1, open.size)
        assertEquals("Spam!", open.single().excerpt)
        assertEquals("Werbung", open.single().note)
        assertEquals("Autor", open.single().targetUserName)
        assertEquals(club.toString(), open.single().contextId)

        val resolved = reportService.resolveGroupReport(UUID.fromString(open.single().id), ResolveReportRequest("removed"), board)
        assertEquals("resolved", resolved.status)
        assertEquals("removed", resolved.resolution)
        assertFalse(chatMessageRepository.findById(messageId).isPresent)
        assertTrue(reportService.groupReports(board, includeResolved = false).none { it.targetId == message.id })

        val moment = momentService.startMoment(StartMomentRequest(title = "Anstoßen", topicType = "toast", visibility = "group"), author)
        reportService.reportMoment(UUID.fromString(moment.id), CreateReportRequest(reason = "inappropriate"), reporter)
        val momentReport = reportService.groupReports(board, includeResolved = false).single { it.targetId == moment.id }
        val dismissed = reportService.resolveGroupReport(UUID.fromString(momentReport.id), ResolveReportRequest("dismissed"), board)
        assertEquals("dismissed", dismissed.resolution)
        assertTrue(momentService.listActiveMoments(reporter).any { it.id == moment.id })
    }

    @Test
    fun `direct message reports go to the application administration`() {
        val alice = person("Alice")
        val bob = person("Bob")
        val platform = person("Plattform").copy(platformAdmin = true)
        val direct = UUID.fromString(directMessageService.start(idOf(bob).toString(), alice).id)
        val sent = directMessageService.send(direct, SendMessageRequest(message = "Unschön"), alice)

        val created = TenantContext.runWithoutTenant {
            reportService.reportDirectMessage(direct, UUID.fromString(sent.id), CreateReportRequest(reason = "harassment"), bob)
        }
        assertEquals("platform", created.handledBy)

        assertThrows<AccessDeniedException> { reportService.platformReports(bob, includeResolved = false) }
        val report = reportService.platformReports(platform, includeResolved = false).single { it.targetId == sent.id }
        assertEquals("Unschön", report.excerpt)
        assertEquals("Alice", report.targetUserName)

        reportService.resolvePlatformReport(UUID.fromString(report.id), ResolveReportRequest("removed"), platform)
        assertFalse(directMessageRepository.findById(UUID.fromString(sent.id)).isPresent)
    }
}
