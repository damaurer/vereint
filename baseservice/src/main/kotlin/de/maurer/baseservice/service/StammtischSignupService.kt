package de.maurer.baseservice.service

import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.dto.OpenStammtischRequest
import de.maurer.baseservice.dto.StammtischMembershipDto
import de.maurer.baseservice.dto.StammtischSignupRequest
import de.maurer.baseservice.dto.StammtischSignupResponse
import de.maurer.baseservice.error.ApiException
import de.maurer.baseservice.error.EmailAlreadyRegisteredException
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.RegistrationUnavailableException
import de.maurer.baseservice.identity.IdentityProvisioner
import de.maurer.baseservice.identity.NewAccount
import de.maurer.baseservice.repository.StammtischRepository
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import de.maurer.baseservice.tenancy.TenantContext
import de.maurer.baseservice.tenancy.TenantTransactions
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.util.UUID

/**
 * Kunden eröffnen ihren Stammtisch selbst.
 *
 * - Ohne Konto: [signup] legt das Konto in Keycloak an und eröffnet den
 *   Stammtisch; die Person ist dort Stammtisch-Admin und lädt Mitglieder per
 *   Einladungslink ein.
 * - Mit Konto: [openOwn] eröffnet einen weiteren Stammtisch.
 *
 * Eine Person eröffnet höchstens [maxOwned] aktive Stammtische (Schutz vor Missbrauch).
 */
@Service
class StammtischSignupService(
    private val platformService: PlatformService,
    private val userService: UserService,
    private val userRepository: UserRepository,
    private val stammtischRepository: StammtischRepository,
    private val identityProvisioner: IdentityProvisioner,
    private val tenantTransactions: TenantTransactions,
    private val termsConsent: TermsConsent,
    @Value("\${vereint.signup.enabled:false}") private val enabled: Boolean,
    @Value("\${vereint.signup.max-owned:3}") private val maxOwned: Long
) {

    private val log = LoggerFactory.getLogger(StammtischSignupService::class.java)

    fun signup(request: StammtischSignupRequest): StammtischSignupResponse {
        requireEnabled()
        val stammtischName = platformService.requireName(request.stammtischName)
        val email = request.email?.trim()?.lowercase().orEmpty()
        val firstName = request.firstName?.trim().orEmpty()
        val lastName = request.lastName?.trim().orEmpty()
        val password = request.password.orEmpty()
        if (email.isEmpty() || firstName.isEmpty() || lastName.isEmpty()) {
            throw InvalidRequestException(Msg("error.memberInvite.fieldsRequired"), ErrorCode.INVALID_REQUEST)
        }
        val minLength = MemberInviteService.MIN_PASSWORD_LENGTH
        val maxLength = MemberInviteService.MAX_PASSWORD_LENGTH
        if (password.length < minLength || password.length > maxLength) {
            throw InvalidRequestException(Msg("error.memberInvite.passwordLength", minLength, maxLength), ErrorCode.INVALID_REQUEST)
        }
        termsConsent.require(request.acceptTerms)
        if (tenantTransactions.readAsSystem { userRepository.existsByEmailIgnoreCase(email) }) {
            throw EmailAlreadyRegisteredException()
        }

        val subject = identityProvisioner.createAccount(NewAccount(email, firstName, lastName, password))
        var user: UserEntity? = null
        try {
            user = tenantTransactions.asSystem {
                userRepository.saveAndFlush(
                    UserEntity(
                        id = UUID.randomUUID(),
                        keycloakSubject = subject,
                        displayName = "$firstName $lastName",
                        email = email,
                        disabled = false
                    ).also(termsConsent::record)
                )
            }
            val stammtisch = platformService.createStammtisch(stammtischName, user, user)
            log.info("stammtisch signup stammtisch={} user={}", stammtisch.id, user.id)
            return StammtischSignupResponse(email, user.displayName, stammtisch.id.toString(), stammtisch.name)
        } catch (ex: RuntimeException) {
            user?.let { created -> runCatching { tenantTransactions.asSystem { userRepository.deleteById(created.id) } } }
            try {
                identityProvisioner.deleteAccount(subject)
                log.warn("stammtisch signup rolled back; keycloak account removed subject={}", subject)
            } catch (cleanup: RuntimeException) {
                log.error("stammtisch signup rolled back but keycloak account could not be removed subject={}", subject)
            }
            throw ex
        }
    }

    fun openOwn(request: OpenStammtischRequest, principal: UserPrincipal): StammtischMembershipDto {
        requireEnabled()
        val name = platformService.requireName(request.name)
        termsConsent.require(request.acceptTerms)
        val user = TenantContext.runWithoutTenant { userService.getOrCreateUser(principal) }
        val owned = tenantTransactions.readAsSystem { stammtischRepository.countByCreatedByAndArchivedFalse(user.id) }
        if (owned >= maxOwned && !principal.platformAdmin) {
            throw ApiException(ErrorCode.STAMMTISCH_LIMIT, Msg("error.stammtisch.ownLimit", maxOwned), HttpStatus.CONFLICT)
        }
        termsConsent.record(user)
        val consented = tenantTransactions.asSystem { userRepository.saveAndFlush(user) }
        val stammtisch = platformService.createStammtisch(name, consented, consented)
        return StammtischMembershipDto(
            id = stammtisch.id.toString(),
            name = stammtisch.name,
            roles = setOf("admin", "member")
        )
    }

    private fun requireEnabled() {
        if (!enabled) throw RegistrationUnavailableException()
    }
}
