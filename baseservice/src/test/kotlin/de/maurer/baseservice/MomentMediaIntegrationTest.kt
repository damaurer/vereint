package de.maurer.baseservice

import de.maurer.baseservice.dto.CreateEventRequest
import de.maurer.baseservice.dto.SaveMomentReactionRequest
import de.maurer.baseservice.dto.SaveMomentTypeRequest
import de.maurer.baseservice.dto.StartMomentRequest
import de.maurer.baseservice.dto.SubmitMomentResponseRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.MomentMediaRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.EventService
import de.maurer.baseservice.service.MomentConfigService
import de.maurer.baseservice.service.MomentMediaService
import de.maurer.baseservice.service.MomentService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.storage.ObjectStorage
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.imageio.ImageIO

/**
 * Moment-Typen/Reaktionen des Vorstands sowie Bilder und Videos in Moments,
 * gegen H2 mit den echten Migrationen, eingeschalteter Verschlüsselung und dem
 * In-Memory-Objektspeicher.
 */
@SpringBootTest
@ActiveProfiles("test")
class MomentMediaIntegrationTest @Autowired constructor(
    private val eventService: EventService,
    private val momentService: MomentService,
    private val momentMediaService: MomentMediaService,
    private val momentConfigService: MomentConfigService,
    private val momentMediaRepository: MomentMediaRepository,
    private val objectStorage: ObjectStorage,
    private val userService: UserService
) {

    private fun principal(name: String, vararg roles: String) =
        UserPrincipal(subject = "kc-$name-${UUID.randomUUID()}", displayName = name, roles = roles.toSet())

    private class Setup(
        val board: UserPrincipal,
        val member: UserPrincipal,
        val outsider: UserPrincipal,
        val eventId: UUID,
        val momentId: UUID
    )

    private fun setup(topicType: String = "toast"): Setup {
        val board = principal("Vorstand", UserRole.BOARD)
        val member = principal("Mitglied", UserRole.MEMBER)
        val outsider = principal("Fremd", UserRole.MEMBER)
        val memberId = userService.getOrCreateUser(member).id
        userService.getOrCreateUser(outsider)
        val event = eventService.createEvent(
            CreateEventRequest(
                title = "Sommerfest",
                startsAt = Instant.now().plus(Duration.ofDays(1)),
                status = "published",
                inviteUserIds = listOf(memberId.toString())
            ),
            board
        )
        val eventId = UUID.fromString(event.id)
        val moment = momentService.startMoment(
            StartMomentRequest(title = "Prost", topicType = topicType, eventId = event.id, visibility = "event"),
            member
        )
        return Setup(board, member, outsider, eventId, UUID.fromString(moment.id))
    }

    private fun upload(s: Setup, type: String, data: ByteArray, who: UserPrincipal = s.member) =
        momentMediaService.upload(s.momentId, type, data.size.toLong(), ByteArrayInputStream(data), who)

    private fun readAll(s: Setup, mediaId: String, who: UserPrincipal = s.member): ByteArray {
        val content = momentMediaService.prepareContent(s.momentId, UUID.fromString(mediaId), who)
        return momentMediaService.openRange(content, 0, content.sizeBytes - 1).use { it.readAllBytes() }
    }

    @Test
    fun `seeded types and reactions match what the app offered before`() {
        val config = momentConfigService.getConfig()
        assertTrue(config.types.map { it.code }.containsAll(listOf("toast", "prayer", "cheer", "checkin", "other")))
        assertTrue(config.reactions.map { it.code }.containsAll(listOf("TOAST", "PRAYER", "CHEER", "THUMBS_UP", "CELEBRATE", "HEART")))
        val toast = config.types.first { it.code == "toast" }
        assertEquals("🍻", toast.emoji)
        assertTrue(toast.allReactions)
        assertEquals(60, config.mediaLimits.maxVideoSeconds)
    }

    @Test
    fun `board defines a type with its own reactions and members can only use those`() {
        val board = principal("Vorstand", UserRole.BOARD)
        val member = principal("Mitglied", UserRole.MEMBER)

        assertThrows<AccessDeniedException> {
            momentConfigService.createReaction(SaveMomentReactionRequest(name = "Tor", emoji = "⚽"), member)
        }

        val goal = momentConfigService.createReaction(SaveMomentReactionRequest(name = "Tor ${UUID.randomUUID()}", emoji = "⚽"), board)
        val type = momentConfigService.createType(
            SaveMomentTypeRequest(
                name = "Public Viewing ${UUID.randomUUID()}",
                emoji = "📺",
                allReactions = false,
                reactionIds = listOf(goal.id)
            ),
            board
        )
        assertEquals(listOf(goal.code), type.allowedReactionCodes)

        val s = setup(topicType = type.code)
        val response = momentService.submitResponse(s.momentId, SubmitMomentResponseRequest(reaction = goal.code), s.member)
        assertEquals("⚽", response.reactionEmoji)
        assertThrows<InvalidRequestException> {
            momentService.submitResponse(s.momentId, SubmitMomentResponseRequest(reaction = "TOAST"), s.member)
        }

        // Ausmustern: keine neuen Moments, bestehende bleiben lesbar.
        momentConfigService.updateType(
            UUID.fromString(type.id),
            SaveMomentTypeRequest(name = type.name, emoji = type.emoji, active = false, allReactions = false, reactionIds = listOf(goal.id)),
            board
        )
        assertThrows<InvalidRequestException> {
            momentService.startMoment(StartMomentRequest(title = "Nochmal", topicType = type.code, eventId = s.eventId.toString()), s.member)
        }
        val detail = momentService.getMomentDetail(s.momentId, s.member)
        assertEquals(type.name, detail.session.topicName)
    }

    @Test
    fun `video is stored encrypted without location, served in ranges and shown after the contribution`() {
        val s = setup()
        val video = mp4(durationSeconds = 12, payloadBytes = 200_000)

        val media = upload(s, "video/quicktime", video)
        assertEquals("video", media.kind)
        assertEquals(12.0, media.durationSeconds)

        val entity = momentMediaRepository.findById(UUID.fromString(media.id)).orElseThrow()
        val stored = objectStorage.read(entity.storageKey)!!
        assertFalse(contains(stored, LOCATION), "Objektspeicher enthält Klartext")
        assertFalse(contains(stored, PAYLOAD_MARKER), "Objektspeicher enthält Klartext")

        val served = readAll(s, media.id)
        assertEquals(video.size, served.size)
        assertFalse(contains(served, LOCATION), "Aufnahmeort wurde nicht entfernt")
        assertFalse(contains(served, "Pixel 9".toByteArray()), "Gerätedaten wurden nicht entfernt")
        assertTrue(contains(served, PAYLOAD_MARKER))
        // Alles außer den neutralisierten Metadaten bleibt Byte für Byte gleich.
        val mdatStart = indexOf(video, "mdat".toByteArray()) - 4
        assertArrayEquals(video.copyOfRange(mdatStart, video.size), served.copyOfRange(mdatStart, served.size))

        // Bereich über eine Blockgrenze des Stromformats hinweg.
        val content = momentMediaService.prepareContent(s.momentId, UUID.fromString(media.id), s.member)
        val slice = momentMediaService.openRange(content, 65_000, 140_000).use { it.readAllBytes() }
        assertArrayEquals(served.copyOfRange(65_000, 140_001), slice)

        // Vor dem Absenden sieht nur der Eigentümer die Datei.
        assertThrows<ResourceNotFoundException> {
            momentMediaService.prepareContent(s.momentId, UUID.fromString(media.id), s.board)
        }

        val response = momentService.submitResponse(
            s.momentId,
            SubmitMomentResponseRequest(statusText = "Seht euch das an", mediaIds = listOf(media.id)),
            s.member
        )
        assertNull(response.reaction)
        assertEquals(1, response.media.size)
        assertArrayEquals(served, readAll(s, media.id, s.board))

        val detail = momentService.getMomentDetail(s.momentId, s.board)
        assertEquals(media.id, detail.responses.single().media.single().id)
        assertTrue(detail.responses.single().media.single().canDelete)

        assertThrows<AccessDeniedException> {
            momentMediaService.prepareContent(s.momentId, UUID.fromString(media.id), s.outsider)
        }
    }

    @Test
    fun `moments without an event belong to the whole group`() {
        val starter = principal("Starter", UserRole.MEMBER)
        val other = principal("Andere", UserRole.MEMBER)
        userService.getOrCreateUser(other)

        val moment = momentService.startMoment(StartMomentRequest(topicType = "toast"), starter)
        assertNull(moment.eventId)
        assertEquals("group", moment.visibility)
        assertEquals("Gemeinsames Anstoßen", moment.title, "Ohne Titel gilt der Name des Themas")

        val momentId = UUID.fromString(moment.id)
        assertTrue(momentService.listActiveMoments(other).any { it.id == moment.id })
        val media = momentMediaService.upload(momentId, "video/mp4", mp4(5, 10_000).size.toLong(), ByteArrayInputStream(mp4(5, 10_000)), other)
        momentService.submitResponse(momentId, SubmitMomentResponseRequest(mediaIds = listOf(media.id)), other)
        assertEquals(1, momentService.getMomentDetail(momentId, starter).responses.size)

        assertThrows<InvalidRequestException> {
            momentService.startMoment(StartMomentRequest(topicType = "toast", visibility = "event"), starter)
        }
    }

    @Test
    fun `event-only moments stay hidden from other group members`() {
        val s = setup()
        assertFalse(momentService.listActiveMoments(s.outsider).any { it.id == s.momentId.toString() })
        assertThrows<AccessDeniedException> { momentService.getMomentDetail(s.momentId, s.outsider) }
        assertTrue(momentService.listActiveMoments(s.member, s.eventId).any { it.id == s.momentId.toString() })
    }

    @Test
    fun `videos longer than the limit and non-videos are rejected and leave nothing behind`() {
        val s = setup()
        val before = momentMediaRepository.count()

        val tooLong = assertThrows<ApiException> { upload(s, "video/mp4", mp4(durationSeconds = 75, payloadBytes = 1000)) }
        assertEquals(ErrorCode.VIDEO_TOO_LONG, tooLong.errorCode)

        assertThrows<InvalidRequestException> { upload(s, "video/mp4", "kein video".repeat(100).toByteArray()) }
        assertThrows<InvalidRequestException> { upload(s, "application/pdf", ByteArray(10)) }

        val tooLarge = assertThrows<ApiException> {
            momentMediaService.upload(
                s.momentId, "video/mp4", MomentMediaService.MAX_VIDEO_BYTES + 1, ByteArrayInputStream(ByteArray(0)), s.member
            )
        }
        assertEquals(ErrorCode.MEDIA_TOO_LARGE, tooLarge.errorCode)

        assertEquals(before, momentMediaRepository.count())
    }

    @Test
    fun `photos are accepted with their size and only owner or moderators may remove media`() {
        val s = setup()
        val image = BufferedImage(40, 30, BufferedImage.TYPE_INT_RGB)
        val png = ByteArrayOutputStream().also { ImageIO.write(image, "png", it) }.toByteArray()

        val media = upload(s, "image/png", png)
        assertEquals("image", media.kind)
        assertEquals(40, media.width)
        assertEquals(30, media.height)
        momentService.submitResponse(s.momentId, SubmitMomentResponseRequest(mediaIds = listOf(media.id)), s.member)
        assertArrayEquals(png, readAll(s, media.id))

        val otherMember = principal("Gast", UserRole.MEMBER)
        assertThrows<AccessDeniedException> {
            momentMediaService.delete(s.momentId, UUID.fromString(media.id), otherMember)
        }
        val key = momentMediaRepository.findById(UUID.fromString(media.id)).orElseThrow().storageKey
        momentMediaService.delete(s.momentId, UUID.fromString(media.id), s.board)
        assertFalse(momentMediaRepository.existsById(UUID.fromString(media.id)))
        assertNull(objectStorage.read(key))
    }

    @Test
    fun `contributions need a reaction, a text or media`() {
        val s = setup()
        assertThrows<InvalidRequestException> {
            momentService.submitResponse(s.momentId, SubmitMomentResponseRequest(), s.member)
        }
    }

    companion object {
        private val LOCATION = "+48.1372+011.5755/".toByteArray()
        private val PAYLOAD_MARKER = "VIDEO-PAYLOAD".toByteArray()

        private fun box(type: String, vararg children: ByteArray): ByteArray {
            val body = children.fold(ByteArray(0)) { acc, b -> acc + b }
            return ByteBuffer.allocate(8 + body.size).putInt(8 + body.size).put(type.toByteArray(Charsets.ISO_8859_1)).put(body).array()
        }

        private fun mvhd(durationSeconds: Int): ByteArray {
            val body = ByteBuffer.allocate(100)
            body.putInt(0) // Version 0, Flags
            body.putInt(0).putInt(0) // creation, modification
            body.putInt(1000) // timescale
            body.putInt(durationSeconds * 1000) // duration
            return box("mvhd", body.array())
        }

        /** Minimales MP4 mit Aufnahmeort in `udta` (Android) und `meta` (iOS) sowie `mdat` mit Nutzdaten. */
        fun mp4(durationSeconds: Int, payloadBytes: Int): ByteArray {
            val ftyp = box("ftyp", "isom".toByteArray(), ByteArray(4), "isommp42".toByteArray())
            val udta = box("udta", box("©xyz", LOCATION), box("©mod", "Pixel 9".toByteArray()))
            val meta = box("meta", ByteArray(4), box("keys", "com.apple.quicktime.location.ISO6709".toByteArray()), LOCATION)
            val trak = box("trak", box("tkhd", ByteArray(84)), box("udta", LOCATION))
            val moov = box("moov", mvhd(durationSeconds), trak, udta, meta)
            val payload = ByteArray(payloadBytes) { (it % 251).toByte() }
            PAYLOAD_MARKER.copyInto(payload, payloadBytes / 2)
            val mdat = box("mdat", payload)
            return ftyp + moov + mdat
        }

        fun indexOf(haystack: ByteArray, needle: ByteArray): Int {
            outer@ for (i in 0..haystack.size - needle.size) {
                for (j in needle.indices) if (haystack[i + j] != needle[j]) continue@outer
                return i
            }
            return -1
        }

        fun contains(haystack: ByteArray, needle: ByteArray) = indexOf(haystack, needle) >= 0
    }
}
