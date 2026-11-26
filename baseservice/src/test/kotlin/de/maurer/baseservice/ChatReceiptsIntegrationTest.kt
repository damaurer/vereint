package de.maurer.baseservice

import de.maurer.baseservice.dto.CreateMemberInviteRequest
import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.dto.MessageReceiptDto
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.live.LiveEvent
import de.maurer.baseservice.live.LiveUpdateHub
import de.maurer.baseservice.push.PushDispatcher
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.ConversationService
import de.maurer.baseservice.service.DirectMessageService
import de.maurer.baseservice.service.MemberInviteService
import de.maurer.baseservice.service.PersonalAlertService
import de.maurer.baseservice.service.PlatformService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.tenancy.TenantContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import java.util.UUID

/**
 * Zugestellt-/Gelesen-Haken, „schreibt gerade…“ und doppelt gesendete
 * Nachrichten (Offline-Versand) in Gruppenchats und Direktnachrichten.
 * Gruppenchats laufen in einer je Test neu angelegten Gruppe B mit genau
 * den Personen, die der Test hineinholt.
 */
@SpringBootTest
@ActiveProfiles("test")
class ChatReceiptsIntegrationTest @Autowired constructor(
    private val platformService: PlatformService,
    private val memberInviteService: MemberInviteService,
    private val userService: UserService,
    private val conversationService: ConversationService,
    private val directMessageService: DirectMessageService,
    private val personalAlertService: PersonalAlertService
) {

    @MockitoSpyBean
    private lateinit var liveUpdateHub: LiveUpdateHub

    /** Wie in [PersonalNetworkIntegrationTest]: gleiche Overrides, damit beide Klassen einen Spring-Kontext teilen. */
    @MockitoSpyBean
    private lateinit var pushDispatcher: PushDispatcher

    private lateinit var adminB: UserPrincipal
    private lateinit var stammtischB: UUID

    @BeforeEach
    fun setup() {
        val platform = UserPrincipal(
            subject = "kc-platform-${UUID.randomUUID()}",
            displayName = "Plattform",
            roles = setOf(UserRole.ADMIN),
            platformAdmin = true
        )
        stammtischB = UUID.fromString(platformService.create(CreateStammtischRequest(name = "Gruppe B"), platform).id)
        adminB = platform.copy(roles = setOf(UserRole.ADMIN, UserRole.MEMBER), stammtischId = stammtischB.toString())
        Mockito.clearInvocations(liveUpdateHub)
    }

    private fun person(name: String) =
        UserPrincipal(subject = "kc-$name-${UUID.randomUUID()}", displayName = name, roles = setOf(UserRole.MEMBER))
            .also { userService.getOrCreateUser(it) }

    private fun idOf(principal: UserPrincipal) = userService.getOrCreateUser(principal).id

    private fun <T> asB(block: () -> T): T = TenantContext.runIn(stammtischB, block)

    /** Holt [principal] in Gruppe B und liefert die Sicht mit gewählter Gruppe B. */
    private fun inB(principal: UserPrincipal): UserPrincipal {
        val token = asB { memberInviteService.createInvite(CreateMemberInviteRequest(), adminB).token }
        TenantContext.runWithoutTenant { memberInviteService.join(token, principal) }
        return principal.copy(stammtischId = stammtischB.toString())
    }

    /** Live-Signale einer Art, die [userId] bekommen hat. */
    private fun liveEventsFor(userId: UUID, type: String): List<LiveEvent> =
        Mockito.mockingDetails(liveUpdateHub).invocations
            .filter { it.method.name == "publish" && (it.arguments[0] as Collection<*>).contains(userId) }
            .map { it.arguments[1] as LiveEvent }
            .filter { it.type == type }

    @Test
    fun `direct messages go from sent to delivered to read and tell the sender`() {
        val alice = person("Alice")
        val bob = person("Bob")
        val conversation = UUID.fromString(directMessageService.start(idOf(bob).toString(), alice).id)

        val sent = directMessageService.send(conversation, SendMessageRequest(message = "Hallo"), alice)
        assertEquals(MessageReceiptDto.SENT, sent.receipt?.status)
        assertEquals(1, sent.receipt?.recipients)

        // Bobs App lädt die Liste: zugestellt, Alice bekommt ein Signal.
        directMessageService.list(bob)
        assertEquals(MessageReceiptDto.DELIVERED, directMessageService.messages(conversation, alice).single().receipt?.status)
        assertEquals(1, liveEventsFor(idOf(alice), LiveEvent.RECEIPT).size)
        // Erneutes Laden ohne Neues schreibt nichts und meldet nichts.
        directMessageService.list(bob)
        assertEquals(1, liveEventsFor(idOf(alice), LiveEvent.RECEIPT).size)

        directMessageService.markRead(conversation, bob)
        val read = directMessageService.messages(conversation, alice).single()
        assertEquals(MessageReceiptDto.READ, read.receipt?.status)
        assertEquals(2, liveEventsFor(idOf(alice), LiveEvent.RECEIPT).size)
        // Fremde Nachrichten tragen keine Haken.
        assertNull(directMessageService.messages(conversation, bob).single().receipt)
    }

    @Test
    fun `message info lists read, delivered and not yet delivered per person, only for the sender`() {
        val alice = inB(person("Alice"))
        val bob = inB(person("Bob"))
        val carol = inB(person("Carol"))
        val club = UUID.fromString(asB { conversationService.clubSummary(alice) }.id)
        val sent = asB { conversationService.sendMessage(club, SendMessageRequest(message = "Wer kommt?"), alice) }
        val messageId = UUID.fromString(sent.id)

        asB { conversationService.listConversations(bob) }
        asB { conversationService.markRead(club, carol) }

        val info = asB { conversationService.messageInfo(club, messageId, alice) }
        val byName = info.recipients.associate { it.displayName to it.status }
        assertEquals(MessageReceiptDto.READ, byName["Carol"])
        assertEquals(MessageReceiptDto.DELIVERED, byName["Bob"])
        assertTrue("Alice" !in byName, "die Absenderin steht nicht in der Liste")
        assertEquals(MessageReceiptDto.READ, info.recipients.first().status, "gelesen zuerst")
        // Noch nicht zugestellt: wer den Chat nie geladen hat (etwa die Gruppenadmin).
        assertTrue(info.recipients.any { it.status == MessageReceiptDto.SENT })

        assertThrows<de.maurer.baseservice.error.AccessDeniedException> {
            asB { conversationService.messageInfo(club, messageId, bob) }
        }
    }

    @Test
    fun `group chats count delivered and read per recipient and keep the unread counter`() {
        val alice = inB(person("Alice"))
        val bob = inB(person("Bob"))
        val carol = inB(person("Carol"))
        val club = UUID.fromString(asB { conversationService.clubSummary(alice) }.id)

        asB { conversationService.sendMessage(club, SendMessageRequest(message = "Wer kommt?"), alice) }
        val recipients = asB { conversationService.listMessages(club, alice) }.single().receipt!!.recipients
        assertTrue(recipients >= 2)

        // Bob hat den Chat nie geöffnet: Zugestellt zählt, Ungelesen bleibt.
        val bobsList = asB { conversationService.listConversations(bob) }
        assertEquals(1, bobsList.single { it.id == club.toString() }.unreadCount)
        var receipt = asB { conversationService.listMessages(club, alice) }.single().receipt!!
        assertEquals(1, receipt.delivered)
        assertEquals(0, receipt.read)
        assertEquals(MessageReceiptDto.SENT, receipt.status)

        // Carol öffnet und liest: zugestellt und gelesen bei zwei.
        asB { conversationService.listMessages(club, carol) }
        asB { conversationService.markRead(club, carol) }
        receipt = asB { conversationService.listMessages(club, alice) }.single().receipt!!
        assertEquals(2, receipt.delivered)
        assertEquals(1, receipt.read)
        assertTrue(liveEventsFor(idOf(alice), LiveEvent.RECEIPT).all { it.conversationId == club.toString() })
        assertTrue(liveEventsFor(idOf(bob), LiveEvent.RECEIPT).isEmpty())
    }

    @Test
    fun `the service worker loading notifications marks chats of all groups delivered`() {
        val alice = inB(person("Alice"))
        val bob = inB(person("Bob"))
        val club = UUID.fromString(asB { conversationService.clubSummary(alice) }.id)
        asB { conversationService.sendMessage(club, SendMessageRequest(message = "Prost"), alice) }
        val dm = UUID.fromString(directMessageService.start(idOf(bob).toString(), alice).id)
        directMessageService.send(dm, SendMessageRequest(message = "Psst"), alice)

        TenantContext.runWithoutTenant { personalAlertService.markDelivered(bob) }

        assertEquals(1, asB { conversationService.listMessages(club, alice) }.single().receipt!!.delivered)
        assertEquals(MessageReceiptDto.DELIVERED, directMessageService.messages(dm, alice).single().receipt?.status)
    }

    @Test
    fun `sending the same message again after a lost answer stores it only once`() {
        val alice = inB(person("Alice"))
        val bob = inB(person("Bob"))
        val club = UUID.fromString(asB { conversationService.clubSummary(alice) }.id)
        val request = SendMessageRequest(message = "Nur einmal", clientId = "c-${UUID.randomUUID()}")

        val first = asB { conversationService.sendMessage(club, request, alice) }
        val again = asB { conversationService.sendMessage(club, request, alice) }
        assertEquals(first.id, again.id)
        assertEquals(request.clientId, again.clientId)
        assertEquals(1, asB { conversationService.listMessages(club, alice) }.count { it.message == "Nur einmal" })
        // Die App-Id sieht nur die Absenderin.
        assertNull(asB { conversationService.listMessages(club, bob) }.single().clientId)

        val dm = UUID.fromString(directMessageService.start(idOf(bob).toString(), alice).id)
        val dmRequest = SendMessageRequest(message = "Auch hier", clientId = "d-${UUID.randomUUID()}")
        assertEquals(
            directMessageService.send(dm, dmRequest, alice).id,
            directMessageService.send(dm, dmRequest, alice).id
        )
        assertEquals(1, directMessageService.messages(dm, bob).size)
        // Dieselbe App-Id in einem anderen Gespräch ist ein Fehler, keine stille Umleitung.
        val carol = inB(person("Carol"))
        val other = UUID.fromString(directMessageService.start(idOf(carol).toString(), alice).id)
        assertThrows<InvalidRequestException> {
            directMessageService.send(other, dmRequest.copy(message = "Falsch"), alice)
        }
    }

    @Test
    fun `typing reaches the other readers only and is throttled`() {
        val alice = inB(person("Alice"))
        val bob = inB(person("Bob"))
        val club = UUID.fromString(asB { conversationService.clubSummary(alice) }.id)

        asB { conversationService.typing(club, alice) }
        asB { conversationService.typing(club, alice) }

        val received = liveEventsFor(idOf(bob), LiveEvent.TYPING)
        assertEquals(1, received.size)
        assertEquals(idOf(alice).toString(), received.single().userId)
        assertEquals("Alice", received.single().name)
        assertEquals(club.toString(), received.single().conversationId)
        assertTrue(liveEventsFor(idOf(alice), LiveEvent.TYPING).isEmpty())

        val dm = UUID.fromString(directMessageService.start(idOf(bob).toString(), alice).id)
        directMessageService.typing(dm, bob)
        assertEquals(dm.toString(), liveEventsFor(idOf(alice), LiveEvent.TYPING).single().conversationId)
    }
}
