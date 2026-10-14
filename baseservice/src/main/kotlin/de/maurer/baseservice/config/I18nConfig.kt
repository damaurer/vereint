package de.maurer.baseservice.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.LocaleResolver
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver
import java.util.Locale

/**
 * Sprachen für benutzerseitige Fehlertexte (`detail` im Fehlerformat, Validierungsmeldungen).
 *
 * Eine neue Sprache benötigt nur `i18n/messages_<code>.properties` und den Eintrag in
 * [supportedLocales]. Unbekannte Sprachen fallen auf [defaultLocale] zurück.
 */
@ConfigurationProperties(prefix = "vereint.i18n")
data class I18nProperties(
    val supportedLocales: List<Locale> = listOf(Locale.GERMAN, Locale.ENGLISH),
    val defaultLocale: Locale = Locale.GERMAN
)

@Configuration
@EnableConfigurationProperties(I18nProperties::class)
class I18nConfig {

    /**
     * Wertet `Accept-Language` aus (die PWA sendet die gewählte App-Sprache, das BFF reicht
     * den Header durch). Der Bean-Name `localeResolver` ersetzt den Standard-Resolver von
     * Spring Boot und wird vom `DispatcherServlet` für `LocaleContextHolder` genutzt.
     */
    @Bean
    fun localeResolver(properties: I18nProperties): LocaleResolver =
        AcceptHeaderLocaleResolver().apply {
            supportedLocales = properties.supportedLocales.ifEmpty { listOf(properties.defaultLocale) }
            setDefaultLocale(properties.defaultLocale)
        }
}
