package de.maurer.baseservice.domain

import jakarta.persistence.*
import org.springframework.data.annotation.CreatedDate
import org.springframework.data.jpa.domain.support.AuditingEntityListener
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * Ledger-Buchung. Das Ledger ist append-only: Korrekturen erfolgen ausschließlich
 * als Gegenbuchung. Datenbankseitig verhindern die Trigger aus
 * `002-integrity-constraints.xml` `UPDATE` und `DELETE`.
 *
 * [entryType] unterscheidet Kauf, Topup, Payout und Korrektur (TICKET-015). Nur
 * Käufe tragen Event, Getränk, Beleg-Snapshot und eine [source]; Topup, Payout und
 * Korrektur kommen ohne Event/Getränk aus, weshalb `event_id`, `drink_id` und
 * `source` seit `005-ledger-transactions.xml` nullbar sind. Eine Korrektur verweist
 * über [reversesEntry] auf die Ursprungsbuchung.
 */
@Entity
@Table(name = "ledger_entries")
@EntityListeners(AuditingEntityListener::class)
class LedgerEntryEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Enumerated(EnumType.STRING)
    @Column(name = "entry_type", length = 32, nullable = false)
    var entryType: LedgerEntryType = LedgerEntryType.purchase,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "event_id")
    var event: EventEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "member_id", nullable = false)
    var member: UserEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "drink_id")
    var drink: DrinkCatalogEntity? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "food_id")
    var food: FoodCatalogEntity? = null,

    @Column(name = "amount", precision = 10, scale = 2, nullable = false)
    var amount: BigDecimal = BigDecimal.ZERO,

    @Column(name = "currency", length = 3, nullable = false)
    var currency: String = "EUR",

    @Enumerated(EnumType.STRING)
    @Column(name = "accounting_mode", length = 32, nullable = false)
    var accountingMode: AccountingMode = AccountingMode.credit,

    @Enumerated(EnumType.STRING)
    @Column(name = "source", length = 32)
    var source: PurchaseSource? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id", nullable = false)
    var actor: UserEntity? = null,

    /** Gegenbuchung: Verweis auf die korrigierte Ursprungsbuchung. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reverses_entry_id")
    var reversesEntry: LedgerEntryEntity? = null,

    @Column(name = "idempotency_key", length = 128, nullable = false)
    var idempotencyKey: String = "",

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    /**
     * Der Beleg-Snapshot ist eigenständig und wird nicht mit der Buchung
     * gelöscht (Fremdschlüssel auf `RESTRICT`).
     *
     * Bewusst keine JPA-Zuordnung: Hibernate lädt die Gegenseite einer
     * `@OneToOne(mappedBy)` immer nach und wertet einen fehlenden Beleg (jede
     * Einzahlung) bei aktivem Stammtisch-Mandanten als „gefiltert". Die Belege
     * füllt [de.maurer.baseservice.service.LedgerSnapshots] gesammelt nach.
     */
    @Transient
    var purchaseSnapshot: PurchaseSnapshotEntity? = null
) : StammtischScoped()

@Entity
@Table(name = "purchase_snapshots")
@EntityListeners(AuditingEntityListener::class)
class PurchaseSnapshotEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ledger_entry_id", nullable = false, unique = true)
    var ledgerEntry: LedgerEntryEntity? = null,

    @Column(name = "item_type", length = 32, nullable = false)
    var itemType: String = "DRINK",

    @Column(name = "drink_name", length = 255)
    var drinkName: String? = null,

    @Column(name = "food_name", length = 255)
    var foodName: String? = null,

    @Column(name = "image_reference", length = 512)
    var imageReference: String? = null,

    @Column(name = "barcode", length = 128)
    var barcode: String? = null,

    @Column(name = "unit_price", precision = 10, scale = 2, nullable = false)
    var unitPrice: BigDecimal = BigDecimal.ZERO,

    @Column(name = "cost_price", precision = 10, scale = 2, nullable = false)
    var costPrice: BigDecimal = BigDecimal.ZERO,

    @Column(name = "profit", precision = 10, scale = 2, nullable = false)
    var profit: BigDecimal = BigDecimal.ZERO,

    @Column(name = "currency", length = 3, nullable = false)
    var currency: String = "EUR",

    @Column(name = "catalog_version")
    var catalogVersion: Int? = 1,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now()
) : StammtischScoped()

/**
 * Idempotenzeinträge sind je Kontext (`scope`) eindeutig, damit ein Schlüssel aus
 * einem Vorgang keinen anderen Vorgang blockiert.
 */
@Entity
@Table(
    name = "idempotency_records",
    uniqueConstraints = [
        UniqueConstraint(name = "uk_idempotency_records_scope_key", columnNames = ["scope", "idempotency_key"])
    ]
)
@EntityListeners(AuditingEntityListener::class)
class IdempotencyRecordEntity(
    @Id
    @Column(name = "id", nullable = false)
    var id: UUID = UUID.randomUUID(),

    @Column(name = "idempotency_key", length = 128, nullable = false)
    var idempotencyKey: String = "",

    @Column(name = "scope", length = 64, nullable = false)
    var scope: String = "",

    @Column(name = "request_hash", length = 64)
    var requestHash: String? = null,

    @Column(name = "response_status")
    var responseStatus: Int? = null,

    @Column(name = "response_payload")
    var responsePayload: String? = null,

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant = Instant.now()
) : StammtischScoped()
