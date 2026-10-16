package de.maurer.baseservice

import de.maurer.baseservice.domain.BillingPlan
import de.maurer.baseservice.dto.OpenStammtischRequest
import de.maurer.baseservice.dto.StammtischSignupRequest
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.EmailAlreadyRegisteredException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.identity.IdentityProvisioner
import de.maurer.baseservice.identity.NewAccount
import de.maurer.baseservice.repository.StammtischSubscriptionRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.service.GroupImageService
import de.maurer.baseservice.service.StammtischSignupService
import de.maurer.baseservice.service.TermsConsent
import de.maurer.baseservice.tenancy.StammtischMemberships
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.Mockito.`when`
import org.mockito.Mockito.never
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.UUID
import javax.imageio.ImageIO

/**
 * Selbstregistrierung: Kunden legen ein Konto an und eröffnen ihren Stammtisch
 * (kostenloser Tarif, Person ist Stammtisch-Admin). Keycloak ist gemockt.
 */
@SpringBootTest
@ActiveProfiles("test")
class StammtischSignupIntegrationTest @Autowired constructor(
    private val signupService: StammtischSignupService,
    private val memberships: StammtischMemberships,
    private val userRepository: UserRepository,
    private val subscriptionRepository: StammtischSubscriptionRepository,
    private val tenantTransactions: TenantTransactions,
    private val groupImageService: GroupImageService,
    private val termsConsent: TermsConsent
) {

    @MockitoBean
    private lateinit var identityProvisioner: IdentityProvisioner

    private fun request(email: String = "kunde-${UUID.randomUUID()}@example.org") = StammtischSignupRequest(
        stammtischName = "Stammtisch Kunde",
        firstName = "Kim",
        lastName = "Kunde",
        email = email,
        password = "ein-langes-passwort",
        acceptTerms = true
    )

    @Test
    fun `signup creates the account and a free Stammtisch with the person as admin`() {
        val subject = "kc-${UUID.randomUUID()}"
        `when`(identityProvisioner.createAccount(any(NewAccount::class.java) ?: NewAccount("", "", "", ""))).thenReturn(subject)

        val response = signupService.signup(request())

        val user = tenantTransactions.readAsSystem { userRepository.findByKeycloakSubject(subject).orElseThrow() }
        val membership = memberships.memberships(user.id).single()
        assertEquals(response.stammtischId, membership.stammtischId.toString())
        assertTrue(membership.roles.contains("admin"))
        val plan = tenantTransactions.readAsSystem {
            subscriptionRepository.findById(membership.stammtischId).map { it.plan }.orElse(BillingPlan.free)
        }
        assertEquals(BillingPlan.free, plan)
        assertEquals(termsConsent.termsVersion, user.termsVersion)
        assertNotNull(user.termsAcceptedAt)
    }

    @Test
    fun `signup without accepting the terms is rejected before Keycloak is called`() {
        val error = assertThrows(InvalidRequestException::class.java) {
            signupService.signup(request().copy(acceptTerms = null))
        }
        assertEquals(ErrorCode.TERMS_NOT_ACCEPTED, error.errorCode)
        verify(identityProvisioner, never()).createAccount(any(NewAccount::class.java) ?: NewAccount("", "", "", ""))
    }

    @Test
    fun `opening another group records the consent and requires it`() {
        val principal = UserPrincipal(subject = "kc-agb-${UUID.randomUUID()}", displayName = "Zustimmung")
        val error = assertThrows(InvalidRequestException::class.java) {
            signupService.openOwn(OpenStammtischRequest(name = "Ohne AGB", acceptTerms = false), principal)
        }
        assertEquals(ErrorCode.TERMS_NOT_ACCEPTED, error.errorCode)

        signupService.openOwn(OpenStammtischRequest(name = "Mit AGB", acceptTerms = true), principal)

        val user = tenantTransactions.readAsSystem { userRepository.findByKeycloakSubject(principal.subject).orElseThrow() }
        assertEquals(termsConsent.termsVersion, user.termsVersion)
        assertNotNull(user.termsAcceptedAt)
    }

    @Test
    fun `an email that already has an account is rejected before Keycloak is called`() {
        val subject = "kc-${UUID.randomUUID()}"
        `when`(identityProvisioner.createAccount(any(NewAccount::class.java) ?: NewAccount("", "", "", ""))).thenReturn(subject)
        val email = "doppelt-$subject@example.org"
        signupService.signup(request(email = email))

        assertThrows(EmailAlreadyRegisteredException::class.java) { signupService.signup(request(email = email.uppercase())) }
        verify(identityProvisioner, times(1)).createAccount(any(NewAccount::class.java) ?: NewAccount("", "", "", ""))
    }

    @Test
    fun `a person opens at most three own Stammtische`() {
        val principal = UserPrincipal(subject = "kc-owner-${UUID.randomUUID()}", displayName = "Eigner")
        repeat(3) { signupService.openOwn(OpenStammtischRequest(name = "Eigener $it", acceptTerms = true), principal) }
        val error = assertThrows(ApiException::class.java) {
            signupService.openOwn(OpenStammtischRequest(name = "Zu viel", acceptTerms = true), principal)
        }
        assertEquals(ErrorCode.STAMMTISCH_LIMIT, error.errorCode)
    }

    @Test
    fun `the group admin sets a picture that only members of the group can see`() {
        val owner = UserPrincipal(subject = "kc-bild-${UUID.randomUUID()}", displayName = "Bild")
        val group = UUID.fromString(signupService.openOwn(OpenStammtischRequest(name = "Bildgruppe", acceptTerms = true), owner).id)
        val png = ByteArrayOutputStream().also { ImageIO.write(BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "png", it) }.toByteArray()

        val adminInGroup = owner.copy(roles = setOf("admin", "member"), stammtischId = group.toString())
        val version = TenantContext.runIn(group) { groupImageService.upload("image/png", png, adminInGroup) }

        assertEquals(1, version)
        assertEquals("image/png", groupImageService.content(group, owner).contentType)
        val stranger = UserPrincipal(subject = "kc-fremd-${UUID.randomUUID()}", displayName = "Fremd")
        assertThrows(ApiException::class.java) { groupImageService.content(group, stranger) }
        val member = UserPrincipal(subject = "kc-mitglied-${UUID.randomUUID()}", roles = setOf("member"), stammtischId = group.toString())
        assertThrows(ApiException::class.java) {
            TenantContext.runIn(group) { groupImageService.upload("image/png", png, member) }
        }
    }
}
