package de.maurer.baseservice.error

import jakarta.servlet.http.HttpServletRequest
import org.springframework.context.MessageSource
import org.springframework.stereotype.Component
import org.springframework.web.servlet.LocaleResolver
import java.util.Locale

/**
 * Löst benutzerseitige Fehlertexte in der Sprache der Anfrage auf.
 *
 * Die Sprache wird direkt über den [LocaleResolver] bestimmt, damit auch Antworten aus der
 * Security-Filterkette (vor dem `DispatcherServlet`) die gewünschte Sprache erhalten.
 */
@Component
class ErrorMessageResolver(
    private val messageSource: MessageSource,
    private val localeResolver: LocaleResolver
) {

    fun locale(request: HttpServletRequest): Locale = localeResolver.resolveLocale(request)

    fun resolve(key: String, request: HttpServletRequest, vararg args: Any?): String =
        Messages.format(messageSource, key, args.map { it.toString() }, key, locale(request))

    /** Übersetzt eine [ApiException] mit Schlüssel; ohne Schlüssel bleibt ihr Text unverändert. */
    fun resolve(ex: ApiException, request: HttpServletRequest): String {
        val key = ex.messageKey ?: return ex.message
        return Messages.format(messageSource, key, ex.messageArgs, ex.message, locale(request))
    }
}
