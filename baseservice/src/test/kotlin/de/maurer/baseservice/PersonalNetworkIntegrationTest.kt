package de.maurer.baseservice

import de.maurer.baseservice.dto.CreateEventRequest
import de.maurer.baseservice.dto.CreateMemberInviteRequest
import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.dto.StartMomentRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.push.PushDispatcher
import de.maurer.baseservice.push.PushMessage
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.CalendarService
import de.maurer.baseservice.service.ConversationService
import de.maurer.baseservice.service.DirectMessageService
import de.maurer.baseservice.service.EventService
import de.maurer.baseservice.service.FriendService
import de.maurer.baseservice.service.MemberInviteService
import de.maurer.baseservice.service.MomentService
import de.maurer.baseservice.service.PersonalAlertService
import de.maurer.baseservice.service.PlatformService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.support.DefaultStammtischExtension.Companion.DEFAULT_STAMMTISCH_ID
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import de.maurer.baseservice.repository.StammtischMemberRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * Gruppenübergreifende Bereiche: Freundesliste, Direktnachrichten und
 * persönlicher Kalender. Gruppe A ist die Standardgruppe der Migration (jedes
 * Test-Konto ist dort Mitglied), B wird je Test neu angelegt.
 */
@SpringBootTest
@ActiveProfiles("test")
class PersonalNetworkIntegrationTest @Autowired constructor(
    private val platformService: PlatformService,
    private val memberInviteService: MemberInviteService,
    private val memberRepository: StammtischMemberRepository,
    private val tenantTransactions: TenantTransactions,
    private val userService: UserService,
    private val eventService: EventService,
    private val momentService: MomentService,
    private val friendService: FriendService,
    private val directMessageService: DirectMessageService,
    private val conversationService: ConversationService,
    private val calendarService: CalendarService,
    private val personalAlertService: PersonalAlertService
) {

    @MockitoSpyBean
    private lateinit var pushDispatcher: PushDispatcher

    private lateinit var platform: UserPrincipal
    private lateinit var adminB: UserPrincipal
    private lateinit var stammtischB: UUID

    @BeforeEach
    fun setup() {
        platform = UserPrincipal(
            subject = "kc-platform-${UUID.randomUUID()}",
            displayName = "Plattform",
            roles = setOf(UserRole.ADMIN),
            platformAdmin = true
        )
        stammtischB = UUID.fromString(platformService.create(CreateStammtischRequest(name = "Gruppe B"), platform).id)
        adminB = platform.copy(roles = setOf(UserRole.ADMIN, UserRole.MEMBER), stammtischId = stammtischB.toString())
    }

    private fun person(name: String) =
        UserPrincipal(subject = "kc-$name-${UUID.randomUUID()}", displayName = name, roles = setOf(UserRole.MEMBER))
            .also { userService.getOrCreateUser(it) }

    private fun idOf(principal: UserPrincipal) = userService.getOrCreateUser(principal).id

    private fun <T> asB(block: () -> T): T = TenantContext.runIn(stammtischB, block)

    private fun joinB(principal: UserPrincipal) {
        val token = asB { memberInviteService.createInvite(CreateMemberInviteRequest(), adminB).token }
        TenantContext.runWithoutTenant { memberInviteService.join(token, principal) }
    }

    /**
     * Beendet die Mitgliedschaft in der Standardgruppe A. Nur die Mitgliedschaft
     * zählt für gemeinsame Gruppen; die Rollen bleiben hier unberührt.
     */
    private fun leaveA(principal: UserPrincipal) {
        val userId = idOf(principal)
        tenantTransactions.inStammtisch(DEFAULT_STAMMTISCH_ID) {
            memberRepository.findByUserId(userId).ifPresent { it.active = false }
        }
    }

    @Test
    fun `friend requests only reach people from own groups and survive leaving a group`() {
        val alice = person("Alice")
        val bob = person("Bob")
        val carol = person("Carol")
        joinB(carol)
        leaveA(carol)

        // Carol ist nur noch in B: für Alice (nur A) unsichtbar.
        assertThrows<ResourceNotFoundException> { friendService.request(idOf(carol).toString(), alice) }
        assertTrue(friendService.contacts(alice).none { it.userId == idOf(carol).toString() })
        assertThrows<InvalidRequestException> { friendService.request(idOf(alice).toString(), alice) }

        val sent = friendService.request(idOf(bob).toString(), alice)
        assertEquals("outgoing", sent.friendStatus)
        assertEquals(listOf("Meine Gruppe"), sent.sharedGroups.map { it.name })
        assertEquals(listOf("Alice"), friendService.overview(bob).incoming.map { it.displayName })

        assertEquals("friend", friendService.accept(idOf(alice).toString(), bob).friendStatus)
        assertEquals(listOf("Bob"), friendService.overview(alice).friends.map { it.displayName })

        // Bob wechselt nach B und verlässt A: die Freundschaft bleibt, eine gemeinsame Gruppe nicht.
        joinB(bob)
        leaveA(bob)
        val bobForAlice = friendService.overview(alice).friends.single()
        assertEquals("Bob", bobForAlice.displayName)
        assertTrue(bobForAlice.sharedGroups.isEmpty())
        assertTrue(bobForAlice.canMessage)
        // Gemeinsame Gruppen nennen nur eigene Gruppen.
        assertEquals(listOf("Gruppe B"), friendService.contacts(carol).single { it.userId == idOf(bob).toString() }.sharedGroups.map { it.name })

        friendService.remove(idOf(bob).toString(), alice)
        assertTrue(friendService.overview(bob).friends.isEmpty())
    }

    @Test
    fun `mutual requests become a friendship`() {
        val alice = person("Alice")
        val bob = person("Bob")
        friendService.request(idOf(bob).toString(), alice)
        assertEquals("friend", friendService.request(idOf(alice).toString(), bob).friendStatus)
        assertTrue(friendService.areFriends(idOf(alice), idOf(bob)))
    }

    @Test
    fun `direct messages span groups and lock when neither friends nor group remain`() {
        val alice = person("Alice")
        val bob = person("Bob")
        val carol = person("Carol")
        joinB(carol)
        leaveA(carol)
        assertThrows<ResourceNotFoundException> { directMessageService.start(idOf(carol).toString(), alice) }

        // Ein Gespräch je Paar, unabhängig von der gewählten Gruppe.
        val fromA = directMessageService.start(idOf(bob).toString(), alice)
        joinB(bob)
        val fromB = asB { directMessageService.start(idOf(alice).toString(), bob) }
        assertEquals(fromA.id, fromB.id)
        val conversationId = UUID.fromString(fromA.id)

        directMessageService.send(conversationId, SendMessageRequest(message = "Hallo aus A"), alice)
        assertEquals(1, asB { directMessageService.unreadCount(bob).unread })
        // Der Chat-Zähler einer Gruppe enthält auch Direktnachrichten.
        assertEquals(1, asB { conversationService.unreadCount(bob).unread } - asB { conversationService.listConversations(bob).sumOf { it.unreadCount } })
        assertThrows<ResourceNotFoundException> { directMessageService.messages(conversationId, carol) }

        // Freunde dürfen sich ohne gemeinsame Gruppe weiter schreiben ...
        friendService.request(idOf(bob).toString(), alice)
        friendService.accept(idOf(alice).toString(), bob)
        leaveA(bob)
        assertTrue(directMessageService.list(alice).single { it.id == fromA.id }.canWrite)
        directMessageService.send(conversationId, SendMessageRequest(message = "Immer noch da"), alice)

        // ... ohne Freundschaft bleibt nur der Verlauf lesbar.
        friendService.remove(idOf(bob).toString(), alice)
        assertFalse(directMessageService.list(alice).single { it.id == fromA.id }.canWrite)
        assertThrows<AccessDeniedException> {
            directMessageService.send(conversationId, SendMessageRequest(message = "Geht nicht"), alice)
        }
        assertEquals(listOf("Hallo aus A", "Immer noch da"), directMessageService.messages(conversationId, bob).map { it.message })
    }

    @Test
    fun `calendar shows visible events and moments of all own groups, nothing from foreign groups`() {
        val owner = person("Owner")
        val bob = person("Bob")
        val alice = person("Alice")
        joinB(bob)
        val bobId = idOf(bob)

        val inA = eventService.createEvent(
            CreateEventRequest(
                title = "Treffen in A",
                startsAt = Instant.now().plus(2, ChronoUnit.DAYS),
                status = "published",
                inviteUserIds = listOf(bobId.toString())
            ),
            owner
        )
        val inB = asB {
            eventService.createEvent(
                CreateEventRequest(
                    title = "Treffen in B",
                    startsAt = Instant.now().minus(3, ChronoUnit.DAYS),
                    status = "published",
                    inviteUserIds = listOf(bobId.toString())
                ),
                adminB
            )
        }
        asB { eventService.createEvent(CreateEventRequest(title = "Entwurf in B", startsAt = Instant.now(), status = "draft"), adminB) }
        val moment = asB {
            momentService.startMoment(UUID.fromString(inB.id), StartMomentRequest(title = "Anstoßen", topicType = "toast"), adminB)
        }

        val bobs = calendarService.calendar(null, null, bob).entries
        val event = bobs.single { it.eventId == inA.id && it.kind == "event" }
        assertEquals("Meine Gruppe", event.stammtischName)
        assertEquals("invited", event.myRsvp)
        assertEquals("Gruppe B", bobs.single { it.eventId == inB.id && it.kind == "event" }.stammtischName)
        val momentEntry = bobs.single { it.kind == "moment" }
        assertEquals(moment.id, momentEntry.id)
        assertEquals(stammtischB.toString(), momentEntry.stammtischId)
        // Fremde Entwürfe und nicht eingeladene Events bleiben draußen.
        assertTrue(bobs.none { it.title == "Entwurf in B" })

        // Alice ist nur in A und nicht eingeladen: nichts aus B, nichts von A.
        val alices = calendarService.calendar(null, null, alice).entries
        assertTrue(alices.none { it.stammtischId == stammtischB.toString() })
        assertTrue(alices.none { it.eventId == inA.id })

        // Mit event.manage in B (Verwaltung) sieht man alle Events von B, auch nicht eingeladen.
        assertTrue(calendarService.calendar(null, null, platform).entries.any { it.eventId == inB.id && it.kind == "event" })

        assertThrows<InvalidRequestException> {
            calendarService.calendar(Instant.now(), Instant.now().minus(1, ChronoUnit.DAYS), bob)
        }
    }

    /** Push-Typen, die seit dem letzten Aufruf an [userId] gingen. */
    private fun pushTypesFor(userId: UUID): List<String> =
        Mockito.mockingDetails(pushDispatcher).invocations
            .filter { it.method.name == "dispatch" && (it.arguments[0] as Collection<*>).contains(userId) }
            .map { (it.arguments[1] as PushMessage).type }

    @Test
    fun `direct messages and friend requests push and show up as personal notifications`() {
        val alice = person("Alice")
        val bob = person("Bob")
        val aliceId = idOf(alice)
        val bobId = idOf(bob)
        Mockito.clearInvocations(pushDispatcher)

        friendService.request(bobId.toString(), alice)
        assertEquals(listOf(PersonalAlertService.TYPE_FRIEND_REQUEST), pushTypesFor(bobId))
        val request = personalAlertService.alerts(bob).single()
        assertEquals(PersonalAlertService.TYPE_FRIEND_REQUEST, request.type)
        assertEquals("Alice möchte mit dir befreundet sein.", request.body)
        assertEquals("/freunde", request.link)
        // Eine wiederholte Anfrage löst keinen weiteren Push aus.
        friendService.request(bobId.toString(), alice)
        assertEquals(1, pushTypesFor(bobId).size)

        friendService.accept(aliceId.toString(), bob)
        assertEquals(listOf(PersonalAlertService.TYPE_FRIEND_ACCEPTED), pushTypesFor(aliceId))
        assertEquals(PersonalAlertService.TYPE_FRIEND_ACCEPTED, personalAlertService.alerts(alice).single().type)
        assertTrue(personalAlertService.alerts(bob).isEmpty())
        // Die Annahme gilt nur kurz als neu.
        assertTrue(personalAlertService.alerts(alice, Instant.now().plus(1, ChronoUnit.HOURS)).isEmpty())

        val conversation = UUID.fromString(directMessageService.start(bobId.toString(), alice).id)
        directMessageService.send(conversation, SendMessageRequest(message = "Erste"), alice)
        directMessageService.send(conversation, SendMessageRequest(message = "Zweite"), alice)
        assertEquals(2, pushTypesFor(bobId).count { it == PersonalAlertService.TYPE_DIRECT_MESSAGE })
        // Je Gespräch nur die neueste ungelesene Nachricht, auch in einer anderen Gruppe.
        joinB(bob)
        val direct = asB { personalAlertService.alerts(bob) }.single()
        assertEquals("Nachricht von Alice", direct.title)
        assertEquals("Zweite", direct.body)
        assertEquals("/direktnachrichten?id=$conversation", direct.link)
        // Eigene Nachrichten und gelesene Gespräche erscheinen nicht.
        assertTrue(personalAlertService.alerts(alice, Instant.now().plus(1, ChronoUnit.HOURS)).isEmpty())
        directMessageService.markRead(conversation, bob)
        assertTrue(personalAlertService.alerts(bob).isEmpty())
    }
}
