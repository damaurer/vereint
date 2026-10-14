package de.maurer.baseservice.support

import de.maurer.baseservice.error.ErrorCode
import de.maurer.baseservice.error.InvalidRequestException
import de.maurer.baseservice.error.Msg
import java.util.UUID

/**
 * Umwandlung der nach außen sichtbaren Textform einer Kennung in den intern
 * verwendeten `java.util.UUID`.
 *
 * Die API-Verträge liefern und erwarten weiterhin Zeichenketten (UUID-Textform);
 * die Datenbank und die JPA-Entitäten arbeiten mit dem nativen Typ. Ungültige
 * Eingaben führen deshalb zu `400` mit dem Fehlerformat nach RFC 7807 und nicht
 * zu einem `500`.
 */
object Identifiers {

    fun parseUuid(value: String?, field: String): UUID =
        parseUuidOrNull(value) ?: throw InvalidRequestException(
            Msg("error.field.invalidUuid", field, value.orEmpty()),
            ErrorCode.INVALID_REQUEST
        )

    /** Liefert `null` für leere oder syntaktisch ungültige Werte. */
    fun parseUuidOrNull(value: String?): UUID? {
        val trimmed = value?.trim()
        if (trimmed.isNullOrEmpty()) {
            return null
        }
        return try {
            UUID.fromString(trimmed)
        } catch (_: IllegalArgumentException) {
            null
        }
    }
}
