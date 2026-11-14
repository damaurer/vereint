package de.maurer.baseservice.dto

import java.time.Instant

/**
 * Metadaten eines Bildes zusammen mit einer zeitlich begrenzten, privaten URL.
 *
 * Die URL ([url]) wird bei jeder Abfrage neu und mit begrenzter Gültigkeit
 * erzeugt; der interne Speicherpfad wird bewusst nicht offengelegt.
 */
data class ImageAssetDto(
    val id: String,
    val purpose: String,
    val targetId: String?,
    val ownerId: String,
    val contentType: String,
    val sizeBytes: Long,
    val width: Int,
    val height: Int,
    val imageVersion: Int,
    val status: String,
    val originalFilename: String?,
    val url: String,
    val urlExpiresInSeconds: Long,
    val createdAt: Instant,
    val updatedAt: Instant
)
