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
    @field:NotBlank(message = "title darf nicht leer sein")
    @field:Size(max = 255, message = "title darf höchstens 255 Zeichen lang sein")
    val title: String,

    @field:NotBlank(message = "topicType darf nicht leer sein")
    @field:Size(max = 64, message = "topicType darf höchstens 64 Zeichen lang sein")
    val topicType: String,

    @field:Size(max = 500, message = "message darf höchstens 500 Zeichen lang sein")
    val message: String? = null,

    val consent: Boolean = false,

    @field:DecimalMin(value = "-90.0", message = "latitude muss zwischen -90 und 90 liegen")
    @field:DecimalMax(value = "90.0", message = "latitude muss zwischen -90 und 90 liegen")
    val latitude: Double? = null,

    @field:DecimalMin(value = "-180.0", message = "longitude muss zwischen -180 und 180 liegen")
    @field:DecimalMax(value = "180.0", message = "longitude muss zwischen -180 und 180 liegen")
    val longitude: Double? = null,

    @field:Min(value = 1, message = "durationMinutes muss mindestens 1 betragen")
    @field:Max(value = 1440, message = "durationMinutes darf höchstens 1440 betragen")
    val durationMinutes: Int = 60
)

/**
 * Anfrage zum Absenden einer Reaktion / eines Status-Updates zu einem aktiven Moment.
 * Teilnehmer können mehrfach während der Laufzeit Status-Updates absenden.
 */
data class SubmitMomentResponseRequest(
    @field:NotBlank(message = "reaction darf nicht leer sein")
    @field:Size(max = 64, message = "reaction darf höchstens 64 Zeichen lang sein")
    val reaction: String,

    @field:Size(max = 255, message = "statusText darf höchstens 255 Zeichen lang sein")
    val statusText: String? = null,

    val consent: Boolean = false,

    @field:DecimalMin(value = "-90.0", message = "latitude muss zwischen -90 und 90 liegen")
    @field:DecimalMax(value = "90.0", message = "latitude muss zwischen -90 und 90 liegen")
    val latitude: Double? = null,

    @field:DecimalMin(value = "-180.0", message = "longitude muss zwischen -180 und 180 liegen")
    @field:DecimalMax(value = "180.0", message = "longitude muss zwischen -180 und 180 liegen")
    val longitude: Double? = null
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
    val reaction: String,
    val statusText: String?,
    val latitude: Double?,
    val longitude: Double?,
    val createdAt: Instant
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
    val totalResponses: Int,
    val uniqueParticipants: Int,
    val summary: String?,
    val completedAt: Instant?
)
