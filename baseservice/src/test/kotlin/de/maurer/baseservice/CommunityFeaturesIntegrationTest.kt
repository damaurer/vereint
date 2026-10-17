package de.maurer.baseservice

import de.maurer.baseservice.dto.BroadcastNotificationRequest
import de.maurer.baseservice.dto.CreateEventRequest
import de.maurer.baseservice.dto.PinNoteRequest
import de.maurer.baseservice.dto.RsvpRequest
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.NotificationRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.ConversationService
import de.maurer.baseservice.service.DirectMessageService
import de.maurer.baseservice.service.EventInvitationService
import de.maurer.baseservice.service.EventService
import de.maurer.baseservice.service.LedgerService
import de.maurer.baseservice.service.NotificationService
import de.maurer.baseservice.service.StatisticsService
import de.maurer.baseservice.service.UserService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Vereinschat, Direktnachrichten, Einladungen mit Zu-/Absage, Rundbriefe,
 * Guthabenübersicht und Statistik gegen H2 mit den echten Migrationen.
 */
@SpringBootTest
@ActiveProfiles("test")
class CommunityFeaturesIntegrationTest @Autowired constructor(
    private val conversationService: ConversationService,
    private val directMessageService: DirectMessageService,
    private val eventService: EventService,
    private val eventInvitationService: EventInvitationService,
    private val notificationService: NotificationService,
    private val ledgerService: LedgerService,
    private val statisticsService: StatisticsService,
    private val userService: UserService,
    private val userRepository: UserRepository,
    private val notificationRepository: NotificationRepository
) {

    private fun principal(name: String, vararg roles: String) =
        UserPrincipal(subject = "kc-$name-${UUID.randomUUID()}", displayName = name, roles = roles.toSet())

    private fun member(name: String) = principal(name, UserRole.MEMBER)

    private fun idOf(principal: UserPrincipal): UUID = userService.getOrCreateUser(principal).id

    @Test
    fun `club chat counts unread messages of others until read and toggles reactions`() {
        val alice = member("Alice")
        val bob = member("Bob")
        idOf(bob)
        val club = conversationService.clubSummary(alice)
        val before = conversationService.listConversations(bob).first { it.type == "club" }.unreadCount

        val sent = conversationService.sendMessage(UUID.fromString(club.id), SendMessageRequest(message = "Hallo Verein"), alice)

        val bobView = conversationService.listConversations(bob).first { it.type == "club" }
        assertEquals(before + 1, bobView.unreadCount)
        assertEquals("Hallo Verein", bobView.lastMessage?.message)
        assertEquals(0, conversationService.listConversations(alice).first { it.type == "club" }.unreadCount)

        conversationService.markRead(UUID.fromString(club.id), bob)
        assertEquals(0, conversationService.unreadCount(bob).unread)

        val reacted = conversationService.toggleReaction(UUID.fromString(club.id), UUID.fromString(sent.id), "🍺", bob)
        assertEquals(1, reacted.reactions.single().count)
        assertTrue(reacted.reactions.single().reactedByMe)
        val removed = conversationService.toggleReaction(UUID.fromString(club.id), UUID.fromString(sent.id), "🍺", bob)
        assertTrue(removed.reactions.isEmpty())
    }

    @Test
    fun `direct messages exist once per pair and stay private`() {
        val alice = member("Alice")
        val bob = member("Bob")
        val carol = member("Carol")
        val aliceToBob = directMessageService.start(idOf(bob).toString(), alice)
        val bobToAlice = directMessageService.start(idOf(alice).toString(), bob)
        assertEquals(aliceToBob.id, bobToAlice.id)
        assertEquals("Bob", aliceToBob.partnerName)

        directMessageService.send(UUID.fromString(aliceToBob.id), SendMessageRequest(message = "Psst"), alice)
        assertEquals(1, directMessageService.list(bob).first { it.id == aliceToBob.id }.unreadCount)
        assertThrows<ResourceNotFoundException> {
            directMessageService.messages(UUID.fromString(aliceToBob.id), carol)
        }
        idOf(carol)
        assertTrue(directMessageService.list(carol).none { it.id == aliceToBob.id })
    }

    @Test
    fun `published event invites members once, lets them answer and opens the event chat`() {
        val owner = member("Owner")
        val bob = member("Bob")
        val outsider = member("Outsider")
        val bobId = idOf(bob)
        idOf(outsider)

        val event = eventService.createEvent(
            CreateEventRequest(
                title = "Sommerfest",
                location = "Vereinsheim",
                startsAt = Instant.now().plus(Duration.ofDays(3)),
                status = "published",
                reminderHoursBefore = 24,
                inviteUserIds = listOf(bobId.toString())
            ),
            owner
        )

        val invitations = notificationRepository.findByUserIdOrderByCreatedAtDesc(bobId)
            .filter { it.type == EventInvitationService.TYPE_INVITATION }
        assertEquals(1, invitations.size)
        assertEquals("/events/${event.id}", invitations.single().link)
        assertTrue(invitations.single().title.contains("Sommerfest"))
        eventInvitationService.dispatchDue()
        assertEquals(1, notificationRepository.findByUserIdOrderByCreatedAtDesc(bobId).count { it.type == EventInvitationService.TYPE_INVITATION })

        assertEquals("invited", eventService.getEvent(UUID.fromString(event.id), bob).myRsvp)
        val answered = eventService.respond(UUID.fromString(event.id), RsvpRequest(status = "declined"), bob)
        assertEquals("declined", answered.myRsvp)
        assertEquals(1, answered.rsvpCounts.declined)
        // Wer abgesagt hat, bleibt eingeladen und kann es sich anders überlegen.
        assertEquals("accepted", eventService.respond(UUID.fromString(event.id), RsvpRequest(status = "accepted"), bob).myRsvp)

        assertThrows<AccessDeniedException> {
            eventService.respond(UUID.fromString(event.id), RsvpRequest(status = "accepted"), outsider)
        }
        val chat = conversationService.listConversations(bob).firstOrNull { it.eventId == event.id }
        assertNotNull(chat)
        assertEquals("Sommerfest", chat!!.title)
    }

    @Test
    fun `invitations wait for the configured time and for publishing`() {
        val owner = member("Owner")
        val bob = member("Bob")
        val bobId = idOf(bob)
        val later = eventService.createEvent(
            CreateEventRequest(
                title = "Später",
                startsAt = Instant.now().plus(Duration.ofDays(10)),
                status = "published",
                invitationNotifyAt = Instant.now().plus(Duration.ofDays(2)),
                inviteUserIds = listOf(bobId.toString())
            ),
            owner
        )
        val draft = eventService.createEvent(
            CreateEventRequest(title = "Entwurf", startsAt = Instant.now().plus(Duration.ofDays(10)), inviteUserIds = listOf(bobId.toString())),
            owner
        )
        eventInvitationService.dispatchDue()
        assertTrue(notificationRepository.findByUserIdOrderByCreatedAtDesc(bobId).none { it.type == EventInvitationService.TYPE_INVITATION })
        assertEquals(1, later.participantCount)
        assertNull(later.myRsvp)
        assertEquals("draft", draft.status)
    }

    @Test
    fun `board broadcasts to everyone, pins the club notice and sees all balances`() {
        val board = principal("Vorstand", UserRole.BOARD)
        val bob = member("Bob")
        val bobId = idOf(bob)

        val result = notificationService.broadcast(
            BroadcastNotificationRequest(allMembers = true, title = "Versammlung", body = "Freitag 19 Uhr"),
            board
        )
        assertTrue(result.sent >= 2)
        assertTrue(notificationRepository.findByUserIdOrderByCreatedAtDesc(bobId).any { it.title == "Versammlung" })
        assertThrows<AccessDeniedException> {
            notificationService.broadcast(BroadcastNotificationRequest(allMembers = true, title = "x", body = "y"), bob)
        }

        val pinned = conversationService.pinClubNote(PinNoteRequest(text = "Getränkekasse bitte auffüllen"), board)
        assertEquals("Getränkekasse bitte auffüllen", pinned.pinned?.text)
        assertThrows<AccessDeniedException> { conversationService.pinClubNote(PinNoteRequest(text = "Hack"), bob) }
        conversationService.pinClubNote(PinNoteRequest(text = null), board)

        assertTrue(ledgerService.listBalances(board).any { it.memberId == bobId.toString() && it.displayName == "Bob" })
        assertThrows<AccessDeniedException> { ledgerService.listBalances(bob) }
        assertTrue(userService.directory(bob).any { it.id == bobId.toString() })
        assertTrue(userRepository.findById(bobId).isPresent)
    }

    @Test
    fun `statistics are available to every member`() {
        val stats = statisticsService.clubStatistics(member("Neu"))
        assertEquals(90, stats.periodDays)
        assertEquals(0, stats.myItems)
        assertEquals(8, stats.spending.weekly.size)
    }
}
