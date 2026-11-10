package de.maurer.baseservice.service

import de.maurer.baseservice.dto.AcceptTermsRequest
import de.maurer.baseservice.dto.TermsStatusDto
import de.maurer.baseservice.repository.UserRepository
import de.maurer.baseservice.security.UserPrincipal
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Zustimmung des angemeldeten Kontos zur gültigen AGB-Fassung.
 *
 * Die App fragt nach dem Login den Stand ab und zeigt bei fehlender oder
 * älterer Zustimmung die AGB mit „Zustimmen“, bevor sie nutzbar ist. Das
 * gilt für alle Konten, auch vom Admin angelegte und bestehende.
 */
@Service
@Transactional
class TermsService(
    private val userService: UserService,
    private val userRepository: UserRepository,
    private val termsConsent: TermsConsent
) {

    @Transactional(readOnly = true)
    fun status(principal: UserPrincipal): TermsStatusDto = toDto(userService.getOrCreateUser(principal))

    fun accept(principal: UserPrincipal, request: AcceptTermsRequest): TermsStatusDto {
        termsConsent.require(request.acceptTerms)
        val user = userService.getOrCreateUser(principal)
        if (!termsConsent.isAccepted(user)) {
            termsConsent.record(user)
            userRepository.save(user)
        }
        return toDto(user)
    }

    private fun toDto(user: de.maurer.baseservice.domain.UserEntity) = TermsStatusDto(
        currentVersion = termsConsent.termsVersion,
        acceptedVersion = user.termsVersion,
        acceptedAt = user.termsAcceptedAt,
        accepted = termsConsent.isAccepted(user)
    )
}
