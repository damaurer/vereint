package de.maurer.baseservice.service

import de.maurer.baseservice.dto.OpenStammtischRequest
import de.maurer.baseservice.dto.StammtischSignupRequest
import de.maurer.baseservice.error.RegistrationUnavailableException
import de.maurer.baseservice.identity.IdentityProvisioner
import de.maurer.baseservice.security.UserPrincipal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.http.HttpStatus

/** Ohne `SIGNUP_ENABLED=true` (Standard) lässt sich keine Gruppe eröffnen. */
class StammtischSignupDisabledTest {

    private val identityProvisioner = mock(IdentityProvisioner::class.java)

    private val service = StammtischSignupService(
        platformService = mock(PlatformService::class.java),
        userService = mock(UserService::class.java),
        userRepository = mock(de.maurer.baseservice.repository.UserRepository::class.java),
        stammtischRepository = mock(de.maurer.baseservice.repository.StammtischRepository::class.java),
        identityProvisioner = identityProvisioner,
        tenantTransactions = mock(de.maurer.baseservice.tenancy.TenantTransactions::class.java),
        termsConsent = mock(TermsConsent::class.java),
        enabled = false,
        maxOwned = 3
    )

    @Test
    fun `signup and opening a group are unavailable while signup is disabled`() {
        val signup = assertThrows(RegistrationUnavailableException::class.java) {
            service.signup(
                StammtischSignupRequest(
                    stammtischName = "Gesperrt",
                    firstName = "Kim",
                    lastName = "Kunde",
                    email = "kim@example.org",
                    password = "ein-langes-passwort",
                    acceptTerms = true
                )
            )
        }
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, signup.status)
        assertThrows(RegistrationUnavailableException::class.java) {
            service.openOwn(OpenStammtischRequest(name = "Gesperrt", acceptTerms = true), UserPrincipal(subject = "kc-x"))
        }
        verifyNoInteractions(identityProvisioner)
    }
}
