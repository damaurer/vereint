package de.maurer.baseservice.service

import de.maurer.baseservice.domain.LedgerEntryEntity
import de.maurer.baseservice.domain.LedgerEntryType
import de.maurer.baseservice.repository.AuditLogRepository
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Notizen zu Ein- und Auszahlungen (Issue #121).
 *
 * Die Notiz, die die Kasse bei einer Ein- oder Auszahlung angibt, steht nicht in
 * `ledger_entries` (append-only, ohne Freitext), sondern im Audit-Eintrag der
 * Buchung (`audit_logs.details`, letztes Feld `note=…`, unverschlüsselt). Diese
 * Komponente liest sie gesammelt (eine Abfrage) für die angezeigten Buchungen.
 * Die Abfrage läuft wie jede andere durch den Stammtisch-Filter und die RLS,
 * sieht also nur Einträge der aktiven Gruppe.
 *
 * Nur Topup und Payout liefern eine Notiz für die Anzeige: Käufe und Stornos
 * schreiben dort technische Vermerke, die nicht für Mitglieder bestimmt sind.
 */
@Component
class LedgerNotes(private val auditLogRepository: AuditLogRepository) {

    /** Notiz je Buchungs-ID; Buchungen ohne Notiz fehlen in der Map. */
    fun notesFor(entries: Collection<LedgerEntryEntity>): Map<UUID, String> {
        val ids = entries.filter { it.entryType in NOTE_TYPES }.map { it.id.toString() }.toSet()
        if (ids.isEmpty()) return emptyMap()
        return auditLogRepository
            .findByTargetEntityAndActionInAndTargetIdIn(AuditService.TARGET_LEDGER, NOTE_ACTIONS, ids)
            .mapNotNull { log ->
                val id = log.targetId?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                val note = extractNote(log.details)
                if (id == null || note == null) null else id to note
            }
            .toMap()
    }

    fun noteFor(entry: LedgerEntryEntity): String? = notesFor(listOf(entry))[entry.id]

    companion object {
        private val NOTE_TYPES = setOf(LedgerEntryType.topup, LedgerEntryType.payout)
        private val NOTE_ACTIONS = setOf(AuditService.ACTION_LEDGER_TOPUP, AuditService.ACTION_LEDGER_PAYOUT)
        private const val NOTE_MARKER = "; note="

        /** Bereinigte Notiz, wie sie im Audit-Eintrag abgelegt wird; leer wird `null`. */
        fun normalize(note: String?): String? = note?.trim()?.ifBlank { null }

        /**
         * Liest die Notiz aus den Audit-Details. Das Notizfeld steht immer zuletzt,
         * die Felder davor enthalten keinen Freitext; `-` heißt „keine Notiz".
         */
        fun extractNote(details: String?): String? {
            if (details == null) return null
            val start = details.indexOf(NOTE_MARKER)
            if (start < 0) return null
            val note = details.substring(start + NOTE_MARKER.length)
            return if (note == "-") null else normalize(note)
        }
    }
}
