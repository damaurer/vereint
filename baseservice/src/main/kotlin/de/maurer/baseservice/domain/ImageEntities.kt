package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.time.Instant
import java.util.UUID

/**
 * Metadaten eines im S3-kompatiblen Storage abgelegten Bildes (TICKET-014).
 *
 * PostgreSQL speichert ausschließlich Metadaten: Speicherpfad (`storage_key`),
 * Eigentümer, Zweck, referenziertes Objekt, validierten Bildtyp, Größe,
 * Dimensionen, Version und Status. Die Binärdaten liegen im Objektspeicher; der
 * Zugriff erfolgt ausschließlich über zeitlich begrenzte, private URLs
 * (siehe `docs/architektur.md` und `docs/fachkonzept.md`).
 */
@Entity
@Table(
    name = "image_assets",
    uniqueConstraints = [UniqueConstraint(name = "uk_image_assets_storage_key", columnNames = ["storage_key"])]
)
@EntityListeners(AuditingEntityListener::class)
class ImageAssetEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    /** Schlüssel/Pfad im Objektspeicher; die Rohdaten verlassen den Server nie unsigniert. */
    @Column(name = "storage_key", length = 512, nullable = false)
    var storageKey: String = "",

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    var owner: UserEntity? = null,

    /** Zweckbindung des Bildes; erzwungen über `ck_image_assets_purpose`. */
    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", length = 32, nullable = false)
    var purpose: ImagePurpose = ImagePurpose.profile,

    /**
     * Kennung des referenzierten Fachobjekts (z. B. Event- oder Getränk-ID). Für
     * profil- und DrinkWithMe-Bilder ist dies die Kennung des Eigentümers.
     */
    @Column(name = "target_id")
    var targetId: UUID? = null,

    @Column(name = "content_type", length = 128, nullable = false)
    var contentType: String = "",

    @Column(name = "size_bytes", nullable = false)
    var sizeBytes: Long = 0,

    @Column(name = "width", nullable = false)
    var width: Int = 0,

    @Column(name = "height", nullable = false)
    var height: Int = 0,

    /** Fachliche Bildversion; steigt je Ersetzung eines Objektbildes an. */
    @Column(name = "image_version", nullable = false)
    var imageVersion: Int = 1,

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 32, nullable = false)
    var status: ImageStatus = ImageStatus.active,

    @Column(name = "original_filename", length = 255)
    var originalFilename: String? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
)
