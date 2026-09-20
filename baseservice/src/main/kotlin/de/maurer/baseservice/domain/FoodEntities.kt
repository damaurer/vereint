package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.annotation.LastModifiedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * Globaler Speisen-Katalog auf Vereinsebene.
 */
@Entity
@Table(name = "food_catalog")
@EntityListeners(AuditingEntityListener::class)
class FoodCatalogEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "name", length = 255, nullable = false)
    var name: String = "",

    @Column(name = "description", columnDefinition = "TEXT")
    var description: String? = null,

    @Column(name = "category", length = 64)
    var category: String? = null,

    @Column(name = "default_price", precision = 10, scale = 2, nullable = false)
    var defaultPrice: BigDecimal = BigDecimal.ZERO,

    @Column(name = "cost_price", precision = 10, scale = 2, nullable = false)
    var costPrice: BigDecimal = BigDecimal.ZERO,

    @Column(name = "currency", length = 3, nullable = false)
    var currency: String = "EUR",

    @Column(name = "active", nullable = false)
    var active: Boolean = true,

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

/**
 * Event-spezifisches Speisenangebot mit Preiskonfiguration und Tablet-/Self-Service-Flags.
 */
@Entity
@Table(
    name = "event_food",
    uniqueConstraints = [
        UniqueConstraint(name = "uk_event_food_event_food", columnNames = ["event_id", "food_id"])
    ]
)
@EntityListeners(AuditingEntityListener::class)
class EventFoodEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id", nullable = false)
    var event: EventEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "food_id", nullable = false)
    var food: FoodCatalogEntity? = null,

    @Column(name = "price", precision = 10, scale = 2)
    var price: BigDecimal? = null,

    @Column(name = "cost_price", precision = 10, scale = 2)
    var costPrice: BigDecimal? = null,

    @Column(name = "currency", length = 3, nullable = false)
    var currency: String = "EUR",

    @Column(name = "self_service_enabled", nullable = false)
    var selfServiceEnabled: Boolean = true,

    @Column(name = "tablet_enabled", nullable = false)
    var tabletEnabled: Boolean = true,

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
