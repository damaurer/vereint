package de.maurer.baseservice.storage

import java.net.URI
import java.time.Duration

/**
 * Abstraktion über den S3-kompatiblen Objektspeicher (TICKET-014).
 *
 * Die Fachlogik ([de.maurer.baseservice.service.ImageService]) kennt nur diese
 * Schnittstelle. Für den Betrieb liefert [S3ObjectStorage] eine echte MinIO-/S3-
 * Anbindung; Tests und lokale Läufe ohne Objektspeicher nutzen
 * [InMemoryObjectStorage]. Der lesende Zugriff erfolgt ausschließlich über
 * zeitlich begrenzte, signierte URLs ([presignedGetUrl]).
 */
interface ObjectStorage {

    /** Legt Binärdaten unter [key] ab und überschreibt einen vorhandenen Eintrag. */
    fun store(key: String, data: ByteArray, contentType: String)

    /** Entfernt das Objekt; ein nicht vorhandenes Objekt ist kein Fehler. */
    fun delete(key: String)

    /**
     * Erzeugt eine zeitlich begrenzte, private URL für den lesenden Zugriff.
     * Die URL ist nur innerhalb von [ttl] gültig und enthält keine dauerhaften
     * Zugangsdaten.
     */
    fun presignedGetUrl(key: String, ttl: Duration): URI
}
