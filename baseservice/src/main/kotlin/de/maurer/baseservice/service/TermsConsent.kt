package de.maurer.baseservice.service

import de.maurer.baseservice.domain.UserEntity
import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant

/**
 * Zustimmung zu den AGB (`/agb` im Frontend).
 *
 * Wer ein Konto anlegt oder eine Gruppe eröffnet, muss zustimmen; gespeichert
 * werden die gültige Fassung ([termsVersion]) und der Zeitpunkt am Konto.
 * Das dient als Nachweis, welcher Fassung jemand zugestimmt hat.
 */
@Component
class TermsConsent(
    @Value("\${vereint.legal.terms-version:2026-10-28}") val termsVersion: String,
    private val clock: Clock = Clock.systemUTC()
) {

    /** Ohne ausdrückliche Zustimmung `400 terms_not_accepted`. */
    fun require(acceptTerms: Boolean?) {
        if (acceptTerms != true) {
            throw InvalidRequestException(Msg("error.terms.notAccepted"), ErrorCode.TERMS_NOT_ACCEPTED)
        }
    }

    /** Hält die Zustimmung zur gültigen Fassung am Konto fest; speichern muss der Aufrufer. */
    fun record(user: UserEntity) {
        user.termsVersion = termsVersion
        user.termsAcceptedAt = Instant.now(clock)
    }
}
