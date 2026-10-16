package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.time.Instant
import java.util.UUID

/**
 * Eintrag der gemeinsamen Getränkedatenbank. Gehört keinem Stammtisch und
 * enthält bewusst nur Stammdaten; Preise, Bilder und wer etwas eingetragen
 * hat, bleiben im jeweiligen Stammtisch.
 */
@Entity
@Table(name = "drink_library")
@EntityListeners(AuditingEntityListener::class)
class DrinkLibraryEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "name", length = 255, nullable = false)
    var name: String = "",

    @Column(name = "description")
    var description: String? = null,

    @Column(name = "category", length = 64)
    var category: String? = null,

    @OneToMany(mappedBy = "drink", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    var barcodes: MutableList<DrinkLibraryBarcodeEntity> = mutableListOf(),

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

/** Barcode (EAN) eines Eintrags der gemeinsamen Getränkedatenbank; weltweit eindeutig. */
@Entity
@Table(name = "drink_library_barcodes")
@EntityListeners(AuditingEntityListener::class)
class DrinkLibraryBarcodeEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "library_drink_id", nullable = false)
    var drink: DrinkLibraryEntity? = null,

    @Column(name = "barcode", length = 128, nullable = false)
    var barcode: String = "",

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now()
)
