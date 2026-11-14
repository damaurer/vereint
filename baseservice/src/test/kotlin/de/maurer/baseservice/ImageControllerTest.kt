package de.maurer.baseservice

import de.maurer.baseservice.dto.ImageAssetDto
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.ImageContent
import de.maurer.baseservice.service.ImageService
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.mock.web.MockMultipartFile
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext
import java.time.Instant
import java.util.UUID

@SpringBootTest
@ActiveProfiles("test")
class ImageControllerTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    @MockitoBean
    private lateinit var imageService: ImageService

    private lateinit var mockMvc: MockMvc

    private val imageId: UUID = UUID.randomUUID()
    private val ownerId: UUID = UUID.randomUUID()
    private val targetId: UUID = UUID.randomUUID()

    private fun anyString(): String {
        any(String::class.java)
        return ""
    }

    private fun anyNullableString(): String? {
        any<String>()
        return null
    }

    private fun anyBytes(): ByteArray {
        any(ByteArray::class.java)
        return ByteArray(0)
    }

    private fun anyPrincipal(): UserPrincipal {
        any(UserPrincipal::class.java)
        return UserPrincipal(subject = "dummy")
    }

    private fun anyUuid(): UUID {
        any(UUID::class.java)
        return UUID.randomUUID()
    }

    private fun sampleDto() = ImageAssetDto(
        id = imageId.toString(),
        purpose = "profile",
        targetId = targetId.toString(),
        ownerId = ownerId.toString(),
        contentType = "image/png",
        sizeBytes = 128,
        width = 8,
        height = 8,
        imageVersion = 1,
        status = "active",
        originalFilename = "avatar.png",
        url = "/api/v1/images/$imageId/content",
        urlExpiresInSeconds = 0,
        createdAt = Instant.now(),
        updatedAt = Instant.now()
    )

    private fun pngFile() = MockMultipartFile("file", "avatar.png", "image/png", byteArrayOf(1, 2, 3, 4))

    @BeforeEach
    fun setup() {
        val builder = MockMvcBuilders.webAppContextSetup(context)
        builder.apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
        mockMvc = builder.build()
    }

    @Test
    fun `POST images returns 401 when unauthenticated`() {
        mockMvc.perform(
            multipart("/api/v1/images")
                .file(pngFile())
                .param("purpose", "profile")
        )
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `POST images uploads an image and returns 201`() {
        `when`(
            imageService.uploadImage(anyString(), anyNullableString(), anyNullableString(), anyNullableString(), anyBytes(), anyPrincipal())
        ).thenReturn(sampleDto())

        mockMvc.perform(
            multipart("/api/v1/images")
                .file(pngFile())
                .param("purpose", "profile")
                .with(jwt().jwt { it.subject("sub-owner").claim("realm_access", mapOf("roles" to listOf("member"))) })
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").value(imageId.toString()))
            .andExpect(jsonPath("$.purpose").value("profile"))
            .andExpect(jsonPath("$.status").value("active"))
            .andExpect(jsonPath("$.url").value("/api/v1/images/$imageId/content"))
    }

    @Test
    fun `GET images by id returns the image metadata`() {
        `when`(imageService.getImage(anyUuid(), anyPrincipal())).thenReturn(sampleDto())

        mockMvc.perform(
            get("/api/v1/images/$imageId")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(imageId.toString()))
    }

    @Test
    fun `GET images by id rejects a syntactically invalid identifier with 400`() {
        mockMvc.perform(
            get("/api/v1/images/not-a-uuid")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.code").value("invalid_request"))
            .andExpect(jsonPath("$.traceId").exists())
    }

    @Test
    fun `GET images lists the images of an object`() {
        `when`(imageService.listImages(anyString(), anyNullableString(), anyPrincipal()))
            .thenReturn(listOf(sampleDto()))

        mockMvc.perform(
            get("/api/v1/images")
                .param("purpose", "event")
                .param("targetId", targetId.toString())
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(imageId.toString()))
    }

    @Test
    fun `GET image content returns the decrypted bytes without caching`() {
        val bytes = byteArrayOf(1, 2, 3, 4)
        `when`(imageService.getImageContent(anyUuid(), anyPrincipal())).thenReturn(ImageContent(bytes, "image/png"))

        mockMvc.perform(
            get("/api/v1/images/$imageId/content")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType("image/png"))
            .andExpect(content().bytes(bytes))
            .andExpect(header().string("Cache-Control", "private, no-store"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
    }

    @Test
    fun `GET image content returns 401 when unauthenticated`() {
        mockMvc.perform(get("/api/v1/images/$imageId/content"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `DELETE images returns 204`() {
        mockMvc.perform(
            delete("/api/v1/images/$imageId")
                .with(jwt().jwt { it.subject("sub-owner") })
        )
            .andExpect(status().isNoContent)
    }
}
