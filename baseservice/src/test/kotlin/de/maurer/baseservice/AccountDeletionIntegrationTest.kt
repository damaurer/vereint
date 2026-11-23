package de.maurer.baseservice

import de.maurer.baseservice.dto.CreateMemberInviteRequest
import de.maurer.baseservice.dto.CreateStammtischRequest
import de.maurer.baseservice.dto.DeleteAccountRequest
import de.maurer.baseservice.dto.SendMessageRequest
import de.maurer.baseservice.dto.StartMomentRequest
import de.maurer.baseservice.error.AccountDisabledException
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.identity.IdentityProvisioner
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.AccountDeletionService
import de.maurer.baseservice.service.ChatMediaService
import de.maurer.baseservice.service.ConversationService
import de.maurer.baseservice.service.DirectMessageService
import de.maurer.baseservice.service.FriendService
import de.maurer.baseservice.service.MemberInviteService
import de.maurer.baseservice.service.MomentService
import de.maurer.baseservice.service.PlatformService
import de.maurer.baseservice.service.UserService
import de.maurer.baseservice.storage.ObjectStorage
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.imageio.ImageIO

/**
 * Selbstlöschung eines Kontos (#152) gegen H2 mit den echten Migrationen.
 * Gruppe A ist die Standardgruppe der Tests; weitere Gruppen legt jeder Test an.
 */
@SpringBootTest
@ActiveProfiles("test")
class AccountDeletionIntegrationTest @Autowired constructor(
    private val accountDeletionService: AccountDeletionService,
    private val platformService: PlatformService,
    private val memberInviteService: MemberInviteService,
    private val conversationService: ConversationService,
    private val directMessageService: DirectMessageService,
    private val chatMediaService: ChatMediaService,
    private val friendService: FriendService,
    private val momentService: MomentService,
    private val userService: UserService,
    private val userRepository: UserRepository,
    private val stammtischRepository: StammtischRepository,
    private val objectStorage: ObjectStorage,
    private val tenantTransactions: TenantTransactions,
    private val jdbc: JdbcTemplate
) {

    @MockitoBean
    private lateinit var identityProvisioner: IdentityProvisioner

    private fun person(name: String, vararg roles: String = arrayOf(UserRole.MEMBER)) =
        UserPrincipal(subject = "kc-$name-${UUID.randomUUID()}", displayName = name, roles = roles.toSet())
            .also { userService.getOrCreateUser(it) }

    private fun idOf(principal: UserPrincipal) = userService.getOrCreateUser(principal).id

    /**
     * Plattform-Admin, in der Standardgruppe nur einfaches Mitglied. Eine
     * zweite Person sorgt dafür, dass die Standardgruppe nie archiviert wird.
     */
    private fun platformAdmin(): UserPrincipal {
        person("Nachbar")
        return UserPrincipal(
            subject = "kc-platform-${UUID.randomUUID()}",
            displayName = "Gründerin",
            roles = setOf(UserRole.MEMBER),
            platformAdmin = true
        ).also { userService.getOrCreateUser(it) }
    }

    /** Neue Gruppe; die anlegende Person ist dort Admin. */
    private fun newGroup(name: String, founder: UserPrincipal): UUID =
        UUID.fromString(platformService.create(CreateStammtischRequest(name = name), founder).id)

    private fun join(group: UUID, admin: UserPrincipal, who: UserPrincipal) {
        val scoped = admin.copy(roles = setOf(UserRole.ADMIN, UserRole.MEMBER), stammtischId = group.toString())
        val token = TenantContext.runIn(group) { memberInviteService.createInvite(CreateMemberInviteRequest(), scoped).token }
        TenantContext.runWithoutTenant { memberInviteService.join(token, who) }
    }

    private fun png(): ByteArray {
        val image = BufferedImage(16, 16, BufferedImage.TYPE_INT_RGB)
        return ByteArrayOutputStream().also { ImageIO.write(image, "png", it) }.toByteArray()
    }

    private fun count(sql: String, vararg args: Any): Int =
        tenantTransactions.readAsSystem { jdbc.queryForObject(sql, Int::class.java, *args) ?: 0 }

    @Test
    fun `deleting removes personal content everywhere and keeps a locked placeholder`() {
        `when`(identityProvisioner.canDeleteAccounts).thenReturn(true)
        val anna = person("Anna")
        val ben = person("Ben")
        val annaId = idOf(anna)

        // Gruppenchat mit Foto, Reaktion von Ben auf Annas Nachricht, Annas Reaktion auf Bens.
        val club = UUID.fromString(conversationService.clubSummary(anna).id)
        val data = png()
        val media = chatMediaService.uploadGroup(club, "image/png", data.size.toLong(), ByteArrayInputStream(data), anna)
        val annaMessage = conversationService.sendMessage(club, SendMessageRequest(message = "Prost", mediaIds = listOf(media.id)), anna)
        val benMessage = conversationService.sendMessage(club, SendMessageRequest(message = "Prost zurück"), ben)
        conversationService.toggleReaction(club, UUID.fromString(benMessage.id), "🍺", anna)
        val mediaKey = tenantTransactions.readAsSystem {
            jdbc.queryForObject("select storage_key from chat_media where owner_id = ?", String::class.java, annaId)
        }
        assertNotNull(objectStorage.read(mediaKey!!))

        // Direktchat, Freundschaft und ein eigener Moment.
        val direct = UUID.fromString(directMessageService.start(idOf(ben).toString(), anna).id)
        directMessageService.send(direct, SendMessageRequest(message = "Psst"), anna)
        directMessageService.send(direct, SendMessageRequest(message = "Was denn?"), ben)
        friendService.request(idOf(ben).toString(), anna)
        momentService.startMoment(StartMomentRequest(title = "Anstoßen", topicType = "toast", visibility = "group"), anna)

        val preview = accountDeletionService.preview(anna)
        assertTrue(preview.blockingGroups.isEmpty())
        assertEquals(listOf("Meine Gruppe"), preview.leftGroups.map { it.name })
        assertTrue(preview.loginDeletion)

        assertThrows<InvalidRequestException> { accountDeletionService.delete(DeleteAccountRequest(), anna) }
        val result = TenantContext.runWithoutTenant { accountDeletionService.delete(DeleteAccountRequest(confirm = true), anna) }
        assertTrue(result.loginDeleted)
        verify(identityProvisioner).deleteAccount(anna.subject)

        // Platzhalter statt Person, dauerhaft gesperrt.
        val placeholder = tenantTransactions.readAsSystem { userRepository.findById(annaId).orElseThrow() }
        assertEquals(AccountDeletionService.DELETED_DISPLAY_NAME, placeholder.displayName)
        assertNull(placeholder.email)
        assertTrue(placeholder.disabled)
        assertNotNull(placeholder.deletedAt)
        assertThrows<AccountDisabledException> { userService.getOrCreateUser(anna) }

        // Inhalte und Dateien sind weg, Bens Nachricht bleibt.
        assertEquals(0, count("select count(*) from chat_messages where sender_id = ?", annaId))
        assertEquals(0, count("select count(*) from chat_messages where id = ?", UUID.fromString(annaMessage.id)))
        assertEquals(1, count("select count(*) from chat_messages where id = ?", UUID.fromString(benMessage.id)))
        assertEquals(0, count("select count(*) from chat_reactions where user_id = ?", annaId))
        assertEquals(0, count("select count(*) from chat_media where owner_id = ?", annaId))
        assertNull(objectStorage.read(mediaKey))
        assertEquals(0, count("select count(*) from direct_conversations where id = ?", direct))
        assertEquals(0, count("select count(*) from friendships where requester_id = ? or addressee_id = ?", annaId, annaId))
        assertEquals(0, count("select count(*) from moment_sessions where creator_user_id = ?", annaId))
        assertEquals(0, count("select count(*) from stammtisch_members where user_id = ? and active = true", annaId))
        assertEquals(0, count("select count(*) from user_roles where user_id = ?", annaId))
        assertEquals(1, count("select count(*) from audit_logs where action = 'ACCOUNT_DELETED' and target_id = ?", annaId.toString()))
        assertTrue(directMessageService.list(ben).none { it.id == direct.toString() })
    }

    @Test
    fun `last manager of a group with other members has to hand over first`() {
        val founder = platformAdmin()
        val group = newGroup("Kegelclub", founder)
        val member = person("Mitglied")
        join(group, founder, member)

        val preview = accountDeletionService.preview(founder)
        assertTrue("Kegelclub" in preview.blockingGroups.map { it.name })
        assertTrue(preview.platformAdmin)

        val error = assertThrows<ApiException> {
            accountDeletionService.delete(DeleteAccountRequest(confirm = true), founder)
        }
        assertEquals(ErrorCode.ACCOUNT_DELETION_BLOCKED, error.errorCode)
        assertFalse(tenantTransactions.readAsSystem { userRepository.findById(idOf(founder)).orElseThrow() }.disabled)
        verify(identityProvisioner, never()).deleteAccount(founder.subject)
    }

    @Test
    fun `a group without other members is archived and the login stays when keycloak is not configured`() {
        `when`(identityProvisioner.canDeleteAccounts).thenReturn(false)
        val founder = platformAdmin()
        val group = newGroup("Nur ich", founder)

        assertTrue("Nur ich" in accountDeletionService.preview(founder).archivedGroups.map { it.name })
        val result = accountDeletionService.delete(DeleteAccountRequest(confirm = true), founder)

        assertFalse(result.loginDeleted)
        verify(identityProvisioner, never()).deleteAccount(founder.subject)
        assertTrue(tenantTransactions.readAsSystem { stammtischRepository.findById(group).orElseThrow() }.archived)
    }
}
