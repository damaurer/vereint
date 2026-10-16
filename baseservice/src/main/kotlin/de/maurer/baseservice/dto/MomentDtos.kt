package de.maurer.baseservice.dto

import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant

/**
 * Anfrage zum Starten eines Moments (Gemeinschaftsmomente & Rituale).
 *
 * Eine Standortfreigabe ist zweckgebunden und opt-in: `consent` muss explizit
 * `true` sein, sonst werden Koordinaten verworfen.
 */
data class StartMomentRequest(
    @field:NotBlank(message = "title {validation.notBlank}")
    @field:Size(max = 255, message = "title {validation.size.max}")
    val title: String,

    @field:NotBlank(message = "topicType {validation.notBlank}")
    @field:Size(max = 64, message = "topicType {validation.size.max}")
    val topicType: String,

    @field:Size(max = 500, message = "message {validation.size.max}")
    val message: String? = null,

    val consent: Boolean = false,

    @field:DecimalMin(value = "-90.0", message = "latitude {validation.latitude}")
    @field:DecimalMax(value = "90.0", message = "latitude {validation.latitude}")
    val latitude: Double? = null,

    @field:DecimalMin(value = "-180.0", message = "longitude {validation.longitude}")
    @field:DecimalMax(value = "180.0", message = "longitude {validation.longitude}")
    val longitude: Double? = null,

    @field:Min(value = 1, message = "durationMinutes {validation.min.amount}")
    @field:Max(value = 1440, message = "durationMinutes {validation.max.amount}")
    val durationMinutes: Int = 60
)

/**
 * Anfrage zum Absenden einer Reaktion / eines Status-Updates zu einem aktiven Moment.
 * Teilnehmer können mehrfach während der Laufzeit Status-Updates absenden.
 */
data class SubmitMomentResponseRequest(
    /** Code einer Reaktion; optional, wenn Text oder Bilder/Videos mitkommen. */
    @field:Size(max = 64, message = "reaction {validation.size.max}")
    val reaction: String? = null,

    @field:Size(max = 255, message = "statusText {validation.size.max}")
    val statusText: String? = null,

    val consent: Boolean = false,

    @field:DecimalMin(value = "-90.0", message = "latitude {validation.latitude}")
    @field:DecimalMax(value = "90.0", message = "latitude {validation.latitude}")
    val latitude: Double? = null,

    @field:DecimalMin(value = "-180.0", message = "longitude {validation.longitude}")
    @field:DecimalMax(value = "180.0", message = "longitude {validation.longitude}")
    val longitude: Double? = null,

    /** Zuvor hochgeladene Bilder/Videos, die zu diesem Beitrag gehören. */
    @field:Size(max = 4, message = "mediaIds {validation.size.maxEntries}")
    val mediaIds: List<String> = emptyList()
)

/**
 * Repräsentiert eine Moment-Session in Übersichten und Detailansichten.
 */
data class MomentSessionDto(
    val id: String,
    val eventId: String,
    val creatorId: String,
    val creatorName: String,
    val conversationId: String?,
    val title: String,
    val topicType: String,
    val message: String?,
    val latitude: Double?,
    val longitude: Double?,
    val active: Boolean,
    val topicName: String = topicType,
    val topicEmoji: String? = null,
    val responsesCount: Int = 0,
    val expiresAt: Instant,
    val createdAt: Instant,
    val summary: String? = null
)

/**
 * Einzelne Status-/Reaktions-Rückmeldung eines Teilnehmers.
 */
data class MomentResponseDto(
    val id: String,
    val momentId: String,
    val userId: String,
    val userName: String,
    val reaction: String?,
    val statusText: String?,
    val latitude: Double?,
    val longitude: Double?,
    val createdAt: Instant,
    val reactionName: String? = reaction,
    val reactionEmoji: String? = null,
    val media: List<MomentMediaDto> = emptyList()
)

/**
 * Bild oder Video eines Beitrags. [url] zeigt auf den berechtigungsgeprüften
 * Content-Endpunkt; Videos unterstützen dort HTTP-Range.
 */
data class MomentMediaDto(
    val id: String,
    val kind: String,
    val contentType: String,
    val sizeBytes: Long,
    val width: Int?,
    val height: Int?,
    val durationSeconds: Double?,
    val url: String,
    val canDelete: Boolean
)

/**
 * GeoJSON-Geometrie für Teilnehmer-Pins (RFC 7946).
 */
data class GeoJsonGeometryDto(
    val type: String = "Point",
    val coordinates: List<Double> // [longitude, latitude]
)

/**
 * GeoJSON-Feature für einen Moment-Pin auf der Weltkarte.
 */
data class GeoJsonFeatureDto(
    val type: String = "Feature",
    val geometry: GeoJsonGeometryDto,
    val properties: Map<String, Any?> = emptyMap()
)

/**
 * GeoJSON FeatureCollection für die Weltkartenansicht eines Moments.
 */
data class MomentMapGeoJsonDto(
    val type: String = "FeatureCollection",
    val features: List<GeoJsonFeatureDto> = emptyList()
)

typealias GeoJsonFeatureCollectionDto = MomentMapGeoJsonDto

/**
 * Detaillierte Sicht auf einen Moment inklusive aller Antworten und Karten-GeoJSON.
 */
data class MomentDetailDto(
    val session: MomentSessionDto,
    val responses: List<MomentResponseDto> = emptyList(),
    val mapGeoJson: MomentMapGeoJsonDto = MomentMapGeoJsonDto()
)

/**
 * Zusammenfassung eines abgeschlossenen oder archivierten Moments für die Event-Historie.
 */
data class MomentSummaryDto(
    val momentId: String,
    val title: String,
    val topicType: String,
    val topicName: String = topicType,
    val topicEmoji: String? = null,
    val totalResponses: Int,
    val uniqueParticipants: Int,
    val summary: String?,
    val completedAt: Instant?
)

/** Vom Vorstand gepflegter Moment-Typ. */
data class MomentTypeDto(
    val id: String,
    val code: String,
    val name: String,
    val emoji: String,
    val description: String?,
    val active: Boolean,
    val allReactions: Boolean,
    /** Explizit ausgewählte Reaktionen (nur relevant bei `allReactions = false`). */
    val reactionIds: List<String>,
    /** Codes der Reaktionen, die in Moments dieses Typs gerade wählbar sind. */
    val allowedReactionCodes: List<String>
)

/** Vom Vorstand gepflegte Reaktion. */
data class MomentReactionDto(
    val id: String,
    val code: String,
    val name: String,
    val emoji: String,
    val active: Boolean
)

/** Grenzen für Bilder und Videos, damit die App schon vor dem Upload prüfen kann. */
data class MomentMediaLimitsDto(
    val maxImageBytes: Long,
    val maxVideoBytes: Long,
    val maxVideoSeconds: Int,
    val maxMediaPerResponse: Int,
    val imageTypes: List<String>,
    val videoTypes: List<String>
)

/** Typen, Reaktionen (auch ausgemusterte, für alte Moments) und Upload-Grenzen. */
data class MomentConfigDto(
    val types: List<MomentTypeDto>,
    val reactions: List<MomentReactionDto>,
    val mediaLimits: MomentMediaLimitsDto
)

data class SaveMomentTypeRequest(
    @field:NotBlank(message = "name {validation.notBlank}")
    @field:Size(max = 64, message = "name {validation.size.max}")
    val name: String,

    @field:NotBlank(message = "emoji {validation.notBlank}")
    @field:Size(max = 16, message = "emoji {validation.size.max}")
    val emoji: String,

    @field:Size(max = 255, message = "description {validation.size.max}")
    val description: String? = null,

    val active: Boolean = true,

    val allReactions: Boolean = true,

    @field:Size(max = 100, message = "reactionIds {validation.size.maxEntries}")
    val reactionIds: List<String> = emptyList()
)

data class SaveMomentReactionRequest(
    @field:NotBlank(message = "name {validation.notBlank}")
    @field:Size(max = 64, message = "name {validation.size.max}")
    val name: String,

    @field:NotBlank(message = "emoji {validation.notBlank}")
    @field:Size(max = 16, message = "emoji {validation.size.max}")
    val emoji: String,

    val active: Boolean = true
)
