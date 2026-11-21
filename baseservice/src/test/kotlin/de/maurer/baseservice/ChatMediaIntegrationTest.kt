package de.maurer.baseservice

import de.maurer.baseservice.dto.CreateEventRequest
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.dto.StartMomentRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.ChatMediaService
import de.maurer.baseservice.service.ConversationService
import de.maurer.baseservice.service.DirectMessageService
import de.maurer.baseservice.service.EventService
import de.maurer.baseservice.service.MomentService
import de.maurer.baseservice.service.UserService
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.imageio.ImageIO

/**
 * Fotos und Videos in Gruppen-, Event- und Direktchats sowie laufende
 * Moment-Chats in der Chatliste (H2, echte Migrationen, Verschlüsselung an).
 */
@SpringBootTest
@ActiveProfiles("test")
class ChatMediaIntegrationTest @Autowired constructor(
    private val conversationService: ConversationService,
    private val directMessageService: DirectMessageService,
    private val chatMediaService: ChatMediaService,
    private val eventService: EventService,
    private val momentService: MomentService,
    private val userService: UserService
) {

    private fun person(name: String, vararg roles: String = arrayOf(UserRole.MEMBER)) =
        UserPrincipal(subject = "kc-$name-${UUID.randomUUID()}", displayName = name, roles = roles.toSet())
            .also { userService.getOrCreateUser(it) }

    private fun png(): ByteArray {
        val image = BufferedImage(32, 24, BufferedImage.TYPE_INT_RGB)
        return ByteArrayOutputStream().also { ImageIO.write(image, "png", it) }.toByteArray()
    }

    private fun readGroup(conversationId: String, mediaId: String, who: UserPrincipal): ByteArray {
        val content = chatMediaService.prepareGroupContent(UUID.fromString(conversationId), UUID.fromString(mediaId), who)
        return chatMediaService.openRange(content, 0, content.sizeBytes - 1).use { it.readAllBytes() }
    }

    @Test
    fun `photos in the group chat are visible to the group only after sending`() {
        val anna = person("Anna")
        val ben = person("Ben")
        val club = conversationService.clubSummary(anna)
        val data = png()

        val media = chatMediaService.uploadGroup(UUID.fromString(club.id), "image/png", data.size.toLong(), ByteArrayInputStream(data), anna)
        assertEquals("image", media.kind)
        assertEquals(32, media.width)
        // Vor dem Senden sieht nur Anna die Datei.
        assertArrayEquals(data, readGroup(club.id, media.id, anna))
        assertThrows<ResourceNotFoundException> { readGroup(club.id, media.id, ben) }

        // Nur Foto, ohne Text.
        val sent = conversationService.sendMessage(UUID.fromString(club.id), SendMessageRequest(mediaIds = listOf(media.id)), anna)
        assertEquals("", sent.message)
        assertEquals(listOf(media.id), sent.media.map { it.id })

        val seen = conversationService.listMessages(UUID.fromString(club.id), ben).single { it.id == sent.id }
        assertEquals("/api/v1/conversations/${club.id}/media/${media.id}/content", seen.media.single().url)
        assertArrayEquals(data, readGroup(club.id, media.id, ben))
        assertEquals("image", conversationService.clubSummary(ben).lastMessage?.mediaKind)

        // Ein Upload gehört zu genau einer Nachricht.
        assertThrows<InvalidRequestException> {
            conversationService.sendMessage(UUID.fromString(club.id), SendMessageRequest(message = "nochmal", mediaIds = listOf(media.id)), anna)
        }
        // Ohne Text und ohne Medien geht nichts.
        assertThrows<InvalidRequestException> {
            conversationService.sendMessage(UUID.fromString(club.id), SendMessageRequest(message = "  "), anna)
        }
    }

    @Test
    fun `event chats accept media only from invited people`() {
        val board = person("Vorstand", UserRole.BOARD)
        val guest = person("Eingeladen")
        val other = person("Nicht eingeladen")
        val event = eventService.createEvent(
            CreateEventRequest(
                title = "Grillfest",
                startsAt = Instant.now().plus(Duration.ofDays(1)),
                status = "published",
                inviteUserIds = listOf(userService.getOrCreateUser(guest).id.toString())
            ),
            board
        )
        val chat = conversationService.listConversations(guest).single { it.eventId == event.id }
        val data = png()
        val upload = { who: UserPrincipal ->
            chatMediaService.uploadGroup(UUID.fromString(chat.id), "image/png", data.size.toLong(), ByteArrayInputStream(data), who)
        }
        val media = upload(guest)
        conversationService.sendMessage(UUID.fromString(chat.id), SendMessageRequest(message = "Foto vom Grill", mediaIds = listOf(media.id)), guest)
        assertThrows<AccessDeniedException> { upload(other) }
        assertThrows<AccessDeniedException> { readGroup(chat.id, media.id, other) }
    }

    @Test
    fun `videos in direct messages stay between the two people`() {
        val alice = person("Alice")
        val bob = person("Bob")
        val carol = person("Carol")
        val direct = UUID.fromString(directMessageService.start(userService.getOrCreateUser(bob).id.toString(), alice).id)
        val video = MomentMediaIntegrationTest.mp4(durationSeconds = 5, payloadBytes = 4096)

        val media = chatMediaService.uploadDirect(direct, "video/mp4", video.size.toLong(), ByteArrayInputStream(video), alice)
        assertEquals("video", media.kind)
        assertEquals(5.0, media.durationSeconds)
        // Fremde Uploads lassen sich nicht anhängen.
        assertThrows<InvalidRequestException> {
            directMessageService.send(direct, SendMessageRequest(mediaIds = listOf(media.id)), bob)
        }
        directMessageService.send(direct, SendMessageRequest(mediaIds = listOf(media.id)), alice)

        val received = directMessageService.messages(direct, bob).last()
        assertEquals("/api/v1/direct-conversations/$direct/media/${media.id}/content", received.media.single().url)
        val content = chatMediaService.prepareDirectContent(direct, UUID.fromString(media.id), bob)
        // Ortsangaben aus dem Video sind entfernt.
        val bytes = chatMediaService.openRange(content, 0, content.sizeBytes - 1).use { it.readAllBytes() }
        assertFalse(MomentMediaIntegrationTest.contains(bytes, "+48.1372+011.5755/".toByteArray()))
        assertEquals("video", directMessageService.list(bob).single { it.id == direct.toString() }.lastMessage?.mediaKind)

        assertThrows<ResourceNotFoundException> { chatMediaService.prepareDirectContent(direct, UUID.fromString(media.id), carol) }
        assertThrows<ResourceNotFoundException> {
            chatMediaService.uploadDirect(direct, "video/mp4", video.size.toLong(), ByteArrayInputStream(video), carol)
        }
    }

    @Test
    fun `running moment chats appear in the chat list and can be written to`() {
        val anna = person("Anna")
        val ben = person("Ben")
        val moment = momentService.startMoment(StartMomentRequest(title = "Anstoßen", topicType = "toast", visibility = "group"), anna)

        val entry = conversationService.listConversations(ben).single { it.momentId == moment.id }
        assertEquals("moment", entry.type)
        assertEquals("Moment: Anstoßen", entry.title)
        assertNotNull(entry.expiresAt)

        val data = png()
        val media = chatMediaService.uploadGroup(UUID.fromString(entry.id), "image/png", data.size.toLong(), ByteArrayInputStream(data), ben)
        conversationService.sendMessage(UUID.fromString(entry.id), SendMessageRequest(message = "Prost!", mediaIds = listOf(media.id)), ben)
        val messages = conversationService.listMessages(UUID.fromString(entry.id), anna)
        assertEquals("Prost!", messages.last().message)
        assertEquals(1, messages.last().media.size)
    }
}
