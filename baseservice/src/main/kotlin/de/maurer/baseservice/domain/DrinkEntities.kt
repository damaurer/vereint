package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "drink_catalog")
@EntityListeners(AuditingEntityListener::class)
class DrinkCatalogEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "name", length = 255, nullable = false)
    var name: String = "",

    @Column(name = "description")
    var description: String? = null,

    @Column(name = "category", length = 64)
    var category: String? = null,

    @Column(name = "default_price", precision = 10, scale = 2, nullable = false)
    var defaultPrice: BigDecimal = BigDecimal.ZERO,

    @Column(name = "currency", length = 3, nullable = false)
    var currency: String = "EUR",

    @Column(name = "image_reference", length = 512)
    var imageReference: String? = null,

    @Column(name = "catalog_version", nullable = false)
    var catalogVersion: Int = 1,

    @Column(name = "active", nullable = false)
    var active: Boolean = true,

    /**
     * Freigabezustand gemäß [DrinkStatus]; die Datenbank erzwingt ihn über
     * `ck_drink_catalog_status`. Vorschläge starten als `proposed` und werden
     * ausschließlich durch Vorstand/Admin freigegeben oder abgelehnt.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 32, nullable = false)
    var status: DrinkStatus = DrinkStatus.proposed,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "proposed_by")
    var proposedBy: UserEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "approved_by")
    var approvedBy: UserEntity? = null,

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

@Entity
@Table(name = "drink_barcodes")
@EntityListeners(AuditingEntityListener::class)
class DrinkBarcodeEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "drink_id", nullable = false)
    var drink: DrinkCatalogEntity? = null,

    @Column(name = "barcode", length = 128, nullable = false, unique = true)
    var barcode: String = "",

    @Column(name = "active", nullable = false)
    var active: Boolean = true,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
)

@Entity
@Table(name = "drink_sublists")
@EntityListeners(AuditingEntityListener::class)
class DrinkSublistEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "name", length = 255, nullable = false)
    var name: String = "",

    @Column(name = "description")
    var description: String? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    var createdBy: UserEntity? = null,

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

@Entity
@Table(
    name = "drink_sublist_items",
    uniqueConstraints = [UniqueConstraint(name = "uk_drink_sublist_items_sublist_drink", columnNames = ["sublist_id", "drink_id"])]
)
class DrinkSublistItemEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sublist_id", nullable = false)
    var sublist: DrinkSublistEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "drink_id", nullable = false)
    var drink: DrinkCatalogEntity? = null,

    @Column(name = "default_price", precision = 10, scale = 2)
    var defaultPrice: BigDecimal? = null,

    @Version
    @Column(name = "version", nullable = false)
    var version: Long = 0
)

@Entity
@Table(
    name = "event_drinks",
    uniqueConstraints = [UniqueConstraint(name = "uk_event_drinks_event_drink", columnNames = ["event_id", "drink_id"])]
)
@EntityListeners(AuditingEntityListener::class)
class EventDrinkEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id", nullable = false)
    var event: EventEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "drink_id", nullable = false)
    var drink: DrinkCatalogEntity? = null,

    @Column(name = "price", precision = 10, scale = 2, nullable = false)
    var price: BigDecimal = BigDecimal.ZERO,

    @Column(name = "currency", length = 3, nullable = false)
    var currency: String = "EUR",

    @Column(name = "self_service_enabled", nullable = false)
    var selfServiceEnabled: Boolean = true,

    @Column(name = "tablet_enabled", nullable = false)
    var tabletEnabled: Boolean = true,

    @Column(name = "catalog_version", nullable = false)
    var catalogVersion: Int = 1,

    @Column(name = "image_snapshot", length = 512)
    var imageSnapshot: String? = null,

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
