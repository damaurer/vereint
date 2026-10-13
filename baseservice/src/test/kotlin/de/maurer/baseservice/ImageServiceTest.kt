package de.maurer.baseservice

import de.maurer.baseservice.crypto.DataEncryptor
import de.maurer.baseservice.crypto.EncryptionProperties
import de.maurer.baseservice.domain.DrinkCatalogEntity
import de.maurer.baseservice.domain.DrinkStatus
import de.maurer.baseservice.domain.EventEntity
import de.maurer.baseservice.domain.EventStatus
import de.maurer.baseservice.domain.ImageAssetEntity
import de.maurer.baseservice.domain.ImagePurpose
import de.maurer.baseservice.domain.ImageStatus
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.repository.DrinkCatalogRepository
import de.maurer.baseservice.repository.EventParticipantRepository
import de.maurer.baseservice.repository.EventRepository
import de.maurer.baseservice.repository.ImageAssetRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.ImageService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.storage.InMemoryObjectStorage
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.ArgumentMatchers.any
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.junit.jupiter.MockitoSettings
import org.mockito.quality.Strictness
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.*
import javax.imageio.ImageIO

@ExtendWith(MockitoExtension::class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ImageServiceTest {

    @Mock
    private lateinit var imageAssetRepository: ImageAssetRepository

    @Mock
    private lateinit var userService: UserService

    @Mock
    private lateinit var userRoleRepository: UserRoleRepository

    @Mock
    private lateinit var eventRepository: EventRepository

    @Mock
    private lateinit var eventParticipantRepository: EventParticipantRepository

    @Mock
    private lateinit var drinkCatalogRepository: DrinkCatalogRepository

    private lateinit var objectStorage: InMemoryObjectStorage
    private lateinit var imageService: ImageService
    private lateinit var encryptor: DataEncryptor
    private var lastSaved: ImageAssetEntity? = null

    private val ownerId: UUID = UUID.randomUUID()
    private val otherId: UUID = UUID.randomUUID()
    private val eventId: UUID = UUID.randomUUID()
    private val drinkId: UUID = UUID.randomUUID()
    private val imageId: UUID = UUID.randomUUID()

    @BeforeEach
    fun setup() {
        objectStorage = InMemoryObjectStorage("vereint")
        encryptor = DataEncryptor(EncryptionProperties(enabled = true, key = TEST_KEY))
        imageService = ImageService(
            imageAssetRepository,
            objectStorage,
            encryptor,
            userService,
            userRoleRepository,
            eventRepository,
            eventParticipantRepository,
            drinkCatalogRepository
        )
        `when`(userRoleRepository.findByIdUserId(any(UUID::class.java) ?: ownerId)).thenReturn(emptyList())
        `when`(imageAssetRepository.findMaxImageVersion(any() ?: ImagePurpose.profile, any()))
            .thenReturn(0)
        `when`(imageAssetRepository.findByPurposeAndTargetIdAndStatus(any() ?: ImagePurpose.profile, any(), any() ?: ImageStatus.active))
            .thenReturn(emptyList())
        `when`(imageAssetRepository.save(anyImage())).thenAnswer {
            (it.arguments[0] as ImageAssetEntity).also { saved -> lastSaved = saved }
        }
    }

    private fun anyImage(): ImageAssetEntity = any(ImageAssetEntity::class.java) ?: ImageAssetEntity()

    private fun ownerUser() = UserEntity(id = ownerId, keycloakSubject = "sub-owner", displayName = "Owner")

    private fun otherUser() = UserEntity(id = otherId, keycloakSubject = "sub-other", displayName = "Other")

    private fun pngBytes(width: Int = 8, height: Int = 8): ByteArray {
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val out = ByteArrayOutputStream()
        ImageIO.write(image, "png", out)
        return out.toByteArray()
    }

    @Test
    fun `uploadImage stores a profile image as version one owned by the caller`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)

        val dto = imageService.uploadImage("profile", null, "avatar.png", "image/png", pngBytes(), principal)

        assertEquals(ImagePurpose.profile.name, dto.purpose)
        assertEquals(ownerId.toString(), dto.ownerId)
        assertEquals(ownerId.toString(), dto.targetId)
        assertEquals(1, dto.imageVersion)
        assertEquals(ImageStatus.active.name, dto.status)
        assertEquals("/api/v1/images/${dto.id}/content", dto.url)
        assertTrue(dto.width > 0 && dto.height > 0)
        verify(imageAssetRepository).save(anyImage())
    }

    @Test
    fun `uploadImage rejects an unsupported content type`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)

        val ex = assertThrows(InvalidRequestException::class.java) {
            imageService.uploadImage("profile", null, "malware.exe", "application/octet-stream", pngBytes(), principal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
        verify(imageAssetRepository, never()).save(anyImage())
    }

    @Test
    fun `uploadImage rejects an oversized image`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)

        val tooBig = ByteArray(ImageService.MAX_SIZE_BYTES + 1)
        val ex = assertThrows(InvalidRequestException::class.java) {
            imageService.uploadImage("profile", null, "big.png", "image/png", tooBig, principal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `uploadImage rejects data that is not a decodable image`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)

        val ex = assertThrows(InvalidRequestException::class.java) {
            imageService.uploadImage("profile", null, "fake.png", "image/png", byteArrayOf(1, 2, 3, 4), principal)
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
    }

    @Test
    fun `uploadImage denies event images for a non-owner member`() {
        val owner = ownerUser()
        val other = otherUser()
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(other)
        `when`(eventRepository.findById(eventId)).thenReturn(
            Optional.of(EventEntity(id = eventId, title = "Fest", status = EventStatus.active, owner = owner))
        )

        val ex = assertThrows(AccessDeniedException::class.java) {
            imageService.uploadImage("event", eventId.toString(), "cover.png", "image/png", pngBytes(), principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `uploadImage allows the event owner to add an event image`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(
            Optional.of(EventEntity(id = eventId, title = "Fest", status = EventStatus.active, owner = owner))
        )

        val dto = imageService.uploadImage("event", eventId.toString(), "cover.png", "image/png", pngBytes(), principal)

        assertEquals(ImagePurpose.event.name, dto.purpose)
        assertEquals(eventId.toString(), dto.targetId)
    }

    @Test
    fun `uploadImage reports a missing event target with 404`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.BOARD))
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        `when`(eventRepository.findById(eventId)).thenReturn(Optional.empty())

        val ex = assertThrows(ResourceNotFoundException::class.java) {
            imageService.uploadImage("event", eventId.toString(), "cover.png", "image/png", pngBytes(), principal)
        }
        assertEquals(ErrorCode.NOT_FOUND, ex.errorCode)
    }

    @Test
    fun `uploadImage denies approved drink images for a plain member but allows the board`() {
        val member = otherUser()
        val memberPrincipal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(memberPrincipal)).thenReturn(member)
        `when`(drinkCatalogRepository.findById(drinkId)).thenReturn(
            Optional.of(DrinkCatalogEntity(id = drinkId, name = "Cola", status = DrinkStatus.approved))
        )

        val ex = assertThrows(AccessDeniedException::class.java) {
            imageService.uploadImage("drink", drinkId.toString(), "cola.png", "image/png", pngBytes(), memberPrincipal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)

        val board = ownerUser()
        val boardPrincipal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.BOARD))
        `when`(userService.getOrCreateUser(boardPrincipal)).thenReturn(board)
        val dto = imageService.uploadImage("drink", drinkId.toString(), "cola.png", "image/png", pngBytes(), boardPrincipal)
        assertEquals(ImagePurpose.drink.name, dto.purpose)
    }

    @Test
    fun `uploadImage supersedes the previous active image and increments the version`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)

        val previous = ImageAssetEntity(
            id = imageId,
            storageKey = "profile/$ownerId/old.png",
            owner = owner,
            purpose = ImagePurpose.profile,
            targetId = ownerId,
            contentType = "image/png",
            imageVersion = 2,
            status = ImageStatus.active
        )
        `when`(imageAssetRepository.findMaxImageVersion(ImagePurpose.profile, ownerId)).thenReturn(2)
        `when`(imageAssetRepository.findByPurposeAndTargetIdAndStatus(ImagePurpose.profile, ownerId, ImageStatus.active))
            .thenReturn(listOf(previous))

        val dto = imageService.uploadImage("profile", null, "new.png", "image/png", pngBytes(), principal)

        assertEquals(3, dto.imageVersion)
        assertEquals(ImageStatus.deleted, previous.status)
    }

    @Test
    fun `getImage allows the owner but denies an unrelated member`() {
        val owner = ownerUser()
        val image = ImageAssetEntity(
            id = imageId,
            storageKey = "profile/$ownerId/img.png",
            owner = owner,
            purpose = ImagePurpose.profile,
            targetId = ownerId,
            contentType = "image/png",
            status = ImageStatus.active
        )
        `when`(imageAssetRepository.findById(imageId)).thenReturn(Optional.of(image))

        val ownerPrincipal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(ownerPrincipal)).thenReturn(owner)
        assertEquals(imageId.toString(), imageService.getImage(imageId, ownerPrincipal).id)

        val other = otherUser()
        val otherPrincipal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(otherPrincipal)).thenReturn(other)
        val ex = assertThrows(AccessDeniedException::class.java) {
            imageService.getImage(imageId, otherPrincipal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    @Test
    fun `uploadImage stores only encrypted bytes in the object storage`() {
        val owner = ownerUser()
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)
        val png = pngBytes()

        imageService.uploadImage("profile", null, "avatar.png", "image/png", png, principal)

        val stored = objectStorage.read(lastSaved!!.storageKey)!!
        assertTrue(encryptor.isEncrypted(stored))
        assertFalse(stored.contentEquals(png))
        assertArrayEquals(png, encryptor.decrypt(stored))
        assertEquals(png.size.toLong(), lastSaved!!.sizeBytes)
    }

    @Test
    fun `getImageContent decrypts for the owner but denies an unrelated member`() {
        val owner = ownerUser()
        val key = "profile/$ownerId/img.png"
        val png = pngBytes()
        objectStorage.store(key, encryptor.encrypt(png), "application/octet-stream")
        val image = ImageAssetEntity(
            id = imageId,
            storageKey = key,
            owner = owner,
            purpose = ImagePurpose.profile,
            targetId = ownerId,
            contentType = "image/png",
            status = ImageStatus.active
        )
        `when`(imageAssetRepository.findById(imageId)).thenReturn(Optional.of(image))

        val ownerPrincipal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(ownerPrincipal)).thenReturn(owner)
        val content = imageService.getImageContent(imageId, ownerPrincipal)
        assertArrayEquals(png, content.data)
        assertEquals("image/png", content.contentType)

        val otherPrincipal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(otherPrincipal)).thenReturn(otherUser())
        assertThrows(AccessDeniedException::class.java) {
            imageService.getImageContent(imageId, otherPrincipal)
        }
    }

    @Test
    fun `getImageContent treats deleted images as not found`() {
        val owner = ownerUser()
        val image = ImageAssetEntity(
            id = imageId,
            storageKey = "profile/$ownerId/img.png",
            owner = owner,
            purpose = ImagePurpose.profile,
            targetId = ownerId,
            contentType = "image/png",
            status = ImageStatus.deleted
        )
        `when`(imageAssetRepository.findById(imageId)).thenReturn(Optional.of(image))
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)

        assertThrows(ResourceNotFoundException::class.java) {
            imageService.getImageContent(imageId, principal)
        }
    }

    @Test
    fun `deleteImage removes the object and marks the metadata deleted`() {
        val owner = ownerUser()
        val key = "profile/$ownerId/img.png"
        objectStorage.store(key, pngBytes(), "image/png")
        val image = ImageAssetEntity(
            id = imageId,
            storageKey = key,
            owner = owner,
            purpose = ImagePurpose.profile,
            targetId = ownerId,
            contentType = "image/png",
            status = ImageStatus.active
        )
        `when`(imageAssetRepository.findById(imageId)).thenReturn(Optional.of(image))
        val principal = UserPrincipal(subject = "sub-owner", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(owner)

        imageService.deleteImage(imageId, principal)

        assertFalse(objectStorage.contains(key))
        assertEquals(ImageStatus.deleted, image.status)
        verify(imageAssetRepository).save(image)
    }

    @Test
    fun `deleteImage denies an unrelated member`() {
        val owner = ownerUser()
        val image = ImageAssetEntity(
            id = imageId,
            storageKey = "profile/$ownerId/img.png",
            owner = owner,
            purpose = ImagePurpose.profile,
            targetId = ownerId,
            contentType = "image/png",
            status = ImageStatus.active
        )
        `when`(imageAssetRepository.findById(imageId)).thenReturn(Optional.of(image))
        val other = otherUser()
        val principal = UserPrincipal(subject = "sub-other", roles = setOf(UserRole.MEMBER))
        `when`(userService.getOrCreateUser(principal)).thenReturn(other)

        val ex = assertThrows(AccessDeniedException::class.java) {
            imageService.deleteImage(imageId, principal)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
    }

    companion object {
        private const val TEST_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    }
}
