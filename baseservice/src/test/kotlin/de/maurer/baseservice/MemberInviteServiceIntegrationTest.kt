package de.maurer.baseservice

import de.maurer.baseservice.domain.MemberInviteEntity
import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.CreateMemberInviteRequest
import de.maurer.baseservice.dto.RegisterMemberRequest
import de.maurer.baseservice.error.AccessDeniedException
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.EmailAlreadyRegisteredException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.InvitationExpiredException
import de.maurer.baseservice.error.InvitationRevokedException
import de.maurer.baseservice.error.InvitationUsedUpException
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.identity.IdentityProvisioner
import de.maurer.baseservice.identity.NewAccount
import de.maurer.baseservice.repository.MemberInviteRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.repository.UserRoleRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.security.UserRole
import de.maurer.baseservice.service.MemberInviteService
import de.maurer.baseservice.support.SecureTokens
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.`when`
import org.mockito.Mockito.never
import org.mockito.Mockito.reset
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Registrierung per Einladungslink gegen die echten Migrationen (H2-Profil
 * `test`). Keycloak ist durch einen Mock des [IdentityProvisioner] ersetzt.
 */
@SpringBootTest
@ActiveProfiles("test")
class MemberInviteServiceIntegrationTest @Autowired constructor(
    private val memberInviteService: MemberInviteService,
    private val memberInviteRepository: MemberInviteRepository,
    private val userRepository: UserRepository,
    private val userRoleRepository: UserRoleRepository
) {

    @MockitoBean
    private lateinit var identityProvisioner: IdentityProvisioner

    private val board = UserPrincipal(
        subject = "kc-board-${UUID.randomUUID()}",
        displayName = "Vorstand Test",
        roles = setOf(UserRole.BOARD, UserRole.MEMBER)
    )

    @BeforeEach
    fun setup() {
        reset(identityProvisioner)
        `when`(identityProvisioner.createAccount(anyAccount())).thenAnswer { "kc-new-${UUID.randomUUID()}" }
    }

    private fun anyAccount(): NewAccount {
        any(NewAccount::class.java)
        return NewAccount("x@example.org", "x", "y", "zzzzzzzzzz")
    }

    private fun uniqueEmail() = "neu-${UUID.randomUUID()}@example.org"

    private fun registerRequest(token: String, email: String = uniqueEmail()) = RegisterMemberRequest(
        token = token,
        firstName = "Anna",
        lastName = "Neumann",
        email = email,
        password = "sehr-geheimes-passwort"
    )

    private fun newToken(maxUses: Int = 1): String =
        memberInviteService.createInvite(CreateMemberInviteRequest(maxUses = maxUses), board).token

    @Test
    fun `board creates a link that stores only the token hash`() {
        val response = memberInviteService.createInvite(
            CreateMemberInviteRequest(label = "  Anna  ", expiresInDays = 3),
            board
        )

        assertTrue(response.token.length >= 43)
        assertEquals("/register#${response.token}", response.registerPath)
        assertEquals("Anna", response.invite.label)
        assertEquals("active", response.invite.status)
        assertEquals(1, response.invite.maxUses)

        val stored = memberInviteRepository.findById(UUID.fromString(response.invite.id)).orElseThrow()
        assertEquals(SecureTokens.sha256Hex(response.token), stored.tokenHash)
        assertNotEquals(response.token, stored.tokenHash)
        val days = Duration.between(Instant.now(), stored.expiresAt).toHours()
        assertTrue(days in 71..72)
    }

    @Test
    fun `a regular member cannot create or list links`() {
        val member = UserPrincipal(subject = "kc-member-${UUID.randomUUID()}", roles = setOf(UserRole.MEMBER))

        val ex = assertThrows(AccessDeniedException::class.java) {
            memberInviteService.createInvite(CreateMemberInviteRequest(), member)
        }
        assertEquals(ErrorCode.ACCESS_DENIED, ex.errorCode)
        assertThrows(AccessDeniedException::class.java) { memberInviteService.listInvites(member) }
    }

    @Test
    fun `registration creates exactly one standard member and uses up the link`() {
        val token = newToken()
        val email = uniqueEmail()

        assertNotNull(memberInviteService.preview(token).expiresAt)
        val response = memberInviteService.register(registerRequest(token, email.uppercase()))

        assertEquals(email, response.email)
        assertEquals("Anna Neumann", response.displayName)

        val user = userRepository.findAll().single { it.email == email }
        assertFalse(user.disabled)
        assertEquals(listOf(UserRole.MEMBER), userRoleRepository.findByIdUserId(user.id).map { it.id.role })

        val invite = memberInviteRepository.findByTokenHash(SecureTokens.sha256Hex(token)).orElseThrow()
        assertEquals(1, invite.usesCount)
        val listed = memberInviteService.listInvites(board).single { it.id == invite.id.toString() }
        assertEquals("used", listed.status)
        assertEquals(listOf("Anna Neumann"), listed.registeredMembers)

        val again = assertThrows(InvitationUsedUpException::class.java) {
            memberInviteService.register(registerRequest(token))
        }
        assertEquals(ErrorCode.INVITATION_USED_UP, again.errorCode)
        assertThrows(InvitationUsedUpException::class.java) { memberInviteService.preview(token) }
        verify(identityProvisioner, times(1)).createAccount(anyAccount())
    }

    @Test
    fun `a link with several uses registers several people`() {
        val token = newToken(maxUses = 2)

        memberInviteService.register(registerRequest(token))
        memberInviteService.register(registerRequest(token))

        assertThrows(InvitationUsedUpException::class.java) { memberInviteService.register(registerRequest(token)) }
        verify(identityProvisioner, times(2)).createAccount(anyAccount())
    }

    @Test
    fun `unknown, revoked and expired links never reach keycloak`() {
        assertThrows(ResourceNotFoundException::class.java) {
            memberInviteService.register(registerRequest("unbekannt-${UUID.randomUUID()}"))
        }

        val revokedToken = memberInviteService.createInvite(CreateMemberInviteRequest(), board)
        val revoked = memberInviteService.revokeInvite(UUID.fromString(revokedToken.invite.id), board)
        assertEquals("revoked", revoked.status)
        assertThrows(InvitationRevokedException::class.java) {
            memberInviteService.register(registerRequest(revokedToken.token))
        }

        val expiredToken = SecureTokens.generateToken()
        memberInviteRepository.saveAndFlush(
            MemberInviteEntity(
                tokenHash = SecureTokens.sha256Hex(expiredToken),
                expiresAt = Instant.now().minusSeconds(60)
            )
        )
        assertThrows(InvitationExpiredException::class.java) {
            memberInviteService.register(registerRequest(expiredToken))
        }
        assertThrows(InvitationExpiredException::class.java) { memberInviteService.preview(expiredToken) }

        verify(identityProvisioner, never()).createAccount(anyAccount())
    }

    @Test
    fun `an e-mail that already has a profile is rejected before keycloak`() {
        val email = uniqueEmail()
        userRepository.saveAndFlush(
            UserEntity(id = UUID.randomUUID(), keycloakSubject = "kc-${UUID.randomUUID()}", displayName = "Alt", email = email)
        )
        val token = newToken()

        assertThrows(EmailAlreadyRegisteredException::class.java) {
            memberInviteService.register(registerRequest(token, email.uppercase()))
        }
        verify(identityProvisioner, never()).createAccount(anyAccount())
        assertEquals(0, memberInviteRepository.findByTokenHash(SecureTokens.sha256Hex(token)).orElseThrow().usesCount)
    }

    @Test
    fun `a failure after the keycloak account exists removes that account again`() {
        // Ein bereits vergebenes Subject lässt das Speichern des Profils scheitern.
        val taken = userRepository.saveAndFlush(
            UserEntity(id = UUID.randomUUID(), keycloakSubject = "kc-taken-${UUID.randomUUID()}", displayName = "Belegt")
        )
        `when`(identityProvisioner.createAccount(anyAccount())).thenReturn(taken.keycloakSubject)
        val token = newToken()

        assertThrows(RuntimeException::class.java) { memberInviteService.register(registerRequest(token)) }

        verify(identityProvisioner).deleteAccount(taken.keycloakSubject)
        assertEquals(0, memberInviteRepository.findByTokenHash(SecureTokens.sha256Hex(token)).orElseThrow().usesCount)
    }

    @Test
    fun `keycloak errors leave the link unused`() {
        `when`(identityProvisioner.createAccount(anyAccount()))
            .thenThrow(EmailAlreadyRegisteredException("existiert"))
        val token = newToken()

        assertThrows(EmailAlreadyRegisteredException::class.java) { memberInviteService.register(registerRequest(token)) }

        verify(identityProvisioner, never()).deleteAccount(anyString())
        assertEquals(0, memberInviteRepository.findByTokenHash(SecureTokens.sha256Hex(token)).orElseThrow().usesCount)
    }

    @Test
    fun `short passwords and blank names are rejected`() {
        val token = newToken()

        val ex = assertThrows(InvalidRequestException::class.java) {
            memberInviteService.register(registerRequest(token).copy(password = "kurz"))
        }
        assertEquals(ErrorCode.INVALID_REQUEST, ex.errorCode)
        assertThrows(ApiException::class.java) {
            memberInviteService.register(registerRequest(token).copy(firstName = "   "))
        }
        verify(identityProvisioner, never()).createAccount(anyAccount())
    }
}
