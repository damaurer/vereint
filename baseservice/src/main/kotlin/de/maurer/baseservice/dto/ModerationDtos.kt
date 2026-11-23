package de.maurer.baseservice.dto

import jakarta.validation.constraints.Size
import java.time.Instant

/** Eine Person, die man blockiert hat. */
data class BlockedUserDto(
    val userId: String,
    val displayName: String,
    val since: Instant
)

/** Meldung absenden: Grund `spam`, `harassment`, `inappropriate` oder `other`, optional ein kurzer Text. */
data class CreateReportRequest(
    val reason: String? = null,
    @field:Size(max = 1000, message = "note {validation.size.max}")
    val note: String? = null
)

/** Ergebnis einer Meldung für die meldende Person. */
data class ReportCreatedDto(
    val id: String,
    /** `group`: geht an die Verwaltung der Gruppe; `platform`: an die Anwendungs-Administration. */
    val handledBy: String
)

/** Meldung in der Liste der Verwaltung. */
data class ReportDto(
    val id: String,
    val targetType: String,
    val targetId: String,
    /** Chat, in dem die Nachricht steht (Chatnachrichten), oder Moment (Antworten). */
    val contextId: String?,
    val targetUserId: String?,
    val targetUserName: String?,
    val reporterName: String,
    val reason: String,
    val note: String?,
    val excerpt: String?,
    val status: String,
    val resolution: String?,
    val resolvedByName: String?,
    val resolvedAt: Instant?,
    val createdAt: Instant,
    /** Ob der Inhalt noch existiert und entfernt werden kann. */
    val contentAvailable: Boolean
)

/** Meldung erledigen: `removed` entfernt den Inhalt, `dismissed` schließt ohne Folgen. */
data class ResolveReportRequest(
    val resolution: String? = null
)
