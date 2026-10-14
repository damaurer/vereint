package de.maurer.baseservice.error

import org.springframework.context.MessageSource
import org.springframework.context.NoSuchMessageException
import org.springframework.context.support.ResourceBundleMessageSource
import java.util.Locale

/**
 * Übersetzbare Meldung: Schlüssel aus `i18n/messages*.properties` plus Argumente für die
 * Platzhalter `{0}`, `{1}`, ... (`MessageFormat`).
 *
 * Argumente werden bereits hier in Text umgewandelt, damit IDs, Zahlen und Listen in
 * jeder Sprache unverändert erscheinen (keine sprachabhängige Zahlenformatierung).
 */
class Msg(val key: String, vararg args: Any?) {
    val args: List<String> = args.map { it.toString() }
}

/**
 * Zugriff auf die Meldungstexte der Standardsprache ohne Spring-Kontext.
 *
 * Wird beim Erzeugen einer [ApiException] genutzt, damit `exception.message` (Logs,
 * Unit-Tests ohne Spring) den deutschen Text enthält. Die Auslieferung in der
 * Anfragesprache übernimmt [ErrorMessageResolver] über den Spring-`MessageSource`.
 */
object Messages {

    /** Muss zu `spring.messages.basename` in `application.yaml` passen. */
    const val BASENAME = "i18n/messages"

    /** Standard- und Rückfallsprache; `messages.properties` enthält deren Texte. */
    val DEFAULT_LOCALE: Locale = Locale.GERMAN

    private val source = ResourceBundleMessageSource().apply {
        setBasename(BASENAME)
        setDefaultEncoding(Charsets.UTF_8.name())
        setFallbackToSystemLocale(false)
    }

    fun defaultText(msg: Msg): String = format(source, msg.key, msg.args, msg.key, DEFAULT_LOCALE)

    /**
     * Gemeinsame Formatierungsregel: Ohne Argumente wird der Text unverändert geliefert
     * (einfache Apostrophe bleiben erhalten), mit Argumenten greift `MessageFormat`
     * (Apostrophe sind dort als `''` zu schreiben). Fehlt der Schlüssel, wird [fallback]
     * unverändert geliefert.
     */
    fun format(
        messageSource: MessageSource,
        key: String,
        args: List<String>,
        fallback: String,
        locale: Locale
    ): String = try {
        messageSource.getMessage(key, args.takeIf { it.isNotEmpty() }?.toTypedArray(), locale)
    } catch (ex: NoSuchMessageException) {
        fallback
    }
}
