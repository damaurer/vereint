package de.maurer.baseservice.dto

import java.time.Instant

/**
 * Nach außen sichtbarer Ausschnitt eines Audit-Log-Eintrags (TICKET-022).
 *
 * Kennungen bleiben Zeichenketten in UUID-Textform; personenbezogene Rohdaten
 * (z. B. E-Mail) werden nicht offengelegt. Der lesende Zugriff ist Vorstand und
 * Administration vorbehalten und je Vorstands-Unterrolle auf die erlaubten
 * Bereiche (`Ledger`, `Notification`, `User`) begrenzt.
 *
 * `targetName` nennt die betroffene Person (Mitglied, Empfänger) und
 * `targetTitle` ggf. den Betreff, damit Ansichten ohne rohe IDs auskommen.
 */
data class AuditLogDto(
    val id: String,
    val action: String,
    val targetEntity: String,
    val targetId: String?,
    val actorId: String?,
    val actorDisplayName: String?,
    val details: String?,
    val createdAt: Instant,
    val targetName: String? = null,
    val targetTitle: String? = null
)
