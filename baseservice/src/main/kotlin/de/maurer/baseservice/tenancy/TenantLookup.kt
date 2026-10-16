package de.maurer.baseservice.tenancy

import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.Msg
import de.maurer.baseservice.error.ResourceNotFoundException
import de.maurer.baseservice.support.SecureTokens
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Findet den Stammtisch für Anfragen ohne Anmeldung, die nur ein Geheimnis
 * mitbringen (Gast-Link, Gast-Token, Einladungslink zur Registrierung).
 *
 * Die Abfrage liest im System-Kontext ausschließlich `stammtisch_id`; die
 * eigentliche Verarbeitung läuft danach mit [TenantContext.runIn] im
 * gefundenen Stammtisch. Unbekannte Werte führen zu `404`, ohne zu verraten,
 * ob es den Stammtisch gibt.
 */
@Component
class TenantLookup(private val jdbcTemplate: JdbcTemplate) {

    fun forEvent(eventId: UUID): UUID? =
        single("select stammtisch_id from events where id = ?", eventId)

    fun forEventInviteToken(rawToken: String): UUID? =
        single("select stammtisch_id from event_invites where token_hash = ?", SecureTokens.sha256Hex(rawToken.trim()))

    fun forMemberInviteToken(rawToken: String): UUID? =
        single("select stammtisch_id from member_invites where token_hash = ?", SecureTokens.sha256Hex(rawToken.trim()))

    /** Führt [block] im Stammtisch des Events aus; unbekannte Events ergeben `404`. */
    fun <T> inStammtischOfEvent(eventId: UUID, block: () -> T): T {
        val stammtischId = forEvent(eventId)
            ?: throw ResourceNotFoundException(Msg("error.event.notFound", eventId), ErrorCode.NOT_FOUND)
        return TenantContext.runIn(stammtischId, block)
    }

    /**
     * Führt [block] im Stammtisch des Events aus. Ist das Event unbekannt,
     * läuft [block] ohne Stammtisch und findet damit selbst nichts; so bleiben
     * die bisherigen Antworten für unbekannte Events unverändert.
     */
    fun <T> inStammtischOfEventOrNone(eventId: UUID?, block: () -> T): T =
        runInOrNone(eventId?.let { forEvent(it) }, block)

    /** Wie [inStammtischOfEventOrNone], ermittelt über das Rohtoken eines Event-Magic-Links. */
    fun <T> inStammtischOfEventInviteOrNone(rawToken: String?, block: () -> T): T =
        runInOrNone(rawToken?.takeIf { it.isNotBlank() }?.let { forEventInviteToken(it) }, block)

    private fun <T> runInOrNone(stammtischId: UUID?, block: () -> T): T =
        if (stammtischId != null) TenantContext.runIn(stammtischId, block) else TenantContext.runWithoutTenant(block)

    private fun single(sql: String, arg: Any): UUID? = TenantContext.runAsSystem {
        jdbcTemplate.query(sql, { rs, _ -> rs.getObject(1, UUID::class.java) }, arg).firstOrNull()
    }
}
