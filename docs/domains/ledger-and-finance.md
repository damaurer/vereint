# Fachdomäne: Kassenbuch & Finanzwesen (Ledger)

Das Kassenbuch in **Vereint** bildet das finanzielle Herzstück für Guthabenverwaltung, Getränke- und Speisenabrechnungen, Event-Umsätze und Deckungsbeitragsanalysen. Es folgt strengen Buchhaltungsprinzipien (*Double-Entry Journal*, *Append-Only Revisionssicherheit*, *Idempotenz*).

---

## 🎯 Fachliche Sicht (Business Domain)

### Buchungsarten & Geldflüsse
Das System unterscheidet vier elementare Buchungstypen (`entryType`):

1. **Guthaben-Aufladung (`topup`)**:
   - Einzahlung eines Mitglieds (z. B. Bargeld an den Kassier oder Überweisung).
   - Erhöht das persönliche Guthaben (`creditBalance`).
2. **Getränke- & Speisenkauf (`purchase`)**:
   - Abbuchung für konsumierte Getränke (`drink_id`) oder Speisen (`food_id`) am Theken-Tablet oder via PWA-Barcodescan.
   - Verringert das Guthaben im Modus `credit` oder wird als Bareinnahme im Modus `revenueOnly` verbucht.
   - Erzeugt einen unveränderlichen Beleg-Snapshot (`PurchaseSnapshot`) mit Verkaufs- und Einkaufspreis zur exakten Deckungsbeitragsermittlung.
3. **Guthaben-Auszahlung (`payout`)**:
   - Rückzahlung von verbleibendem Restguthaben bei Vereinsaustritt.
   - Verringert das Guthaben.
4. **Korrekturbuchung / Stornierung (`correction`)**:
   - Revisionssichere Gegenbuchung zu einer früheren Fehlbuchung.
   - Da Einträge niemals gelöscht werden dürfen (*Append-Only*), hebt ein Storno den Ursprungsbetrag über einen referenzierten Gegeneintrag auf.

### Abrechnungsmodi (`accountingMode`)
- **`credit`**: Der Kaufbetrag wird direkt dem persönlichen Vereinskonto des Mitglieds belastet.
- **`revenueOnly`**: Der Umsatz wird statistisch und kassenmäßig erfasst (z. B. bei Barzahlung auf Events oder Pauschal-/Rundenbuchungen), ohne ein Mitgliedskonto zu belasten.

---

## ⚙️ Technische Sicht (Architecture & Implementation)

### 1. Relevante Komponenten & Klassen
- **Controller**: `de.maurer.baseservice.controller.LedgerController`
  - `GET /api/v1/ledger/members/{memberId}/balance` – Aktueller Kontostand (`MemberBalanceDto`)
  - `GET /api/v1/ledger/members/{memberId}/entries` – Revisionssicherer Kontoauszug
  - `GET /api/v1/ledger/events/{eventId}/summary` – Gesamtabrechnung eines Events inkl. Umsatz, Wareneinsatz & Gewinn (`EventLedgerSummaryDto`)
  - `POST /api/v1/ledger/purchases` – PWA Barcode-Kauf (`PurchaseRequest`, erfordert `Idempotency-Key`)
  - `POST /api/v1/ledger/topups` – Guthabenaufladung (nur Vorstand/Admin)
  - `POST /api/v1/ledger/payouts` – Guthabenauszahlung (nur Vorstand/Admin)
  - `POST /api/v1/ledger/corrections` – Gegenbuchung/Storno (`CorrectionRequest`)
- **Service**: `LedgerService`
  - Berechnet Salden und Deckungsbeiträge über aggregierte SQL-Summenabfragen.
  - Speichert `PurchaseSnapshot`-Objekte mit fixem Verkaufs- und Einkaufspreis (`unitPrice`, `costPrice`, `profit = unitPrice - costPrice`) zum Kaufzeitpunkt.
  - Prüft und persistiert Idempotenzschlüssel in `idempotency_records`.
- **Datenbank & Entitäten**:
  - `LedgerEntry`, `PurchaseSnapshot`, `IdempotencyRecord` (in `LedgerEntities.kt`).
  - PostgreSQL Append-Only Trigger `trg_ledger_entries_append_only` und `trg_purchase_snapshots_append_only`.

---

## 💰 Finanzformeln & Deckungsbeitragsrechnung

### 1. Persönliche Saldenberechnung
```text
creditBalance = topupTotal - payoutTotal - (creditPurchases) ± (correctionTotal)
```

Jeder Buchungsdatensatz speichert den Betrag als `DECIMAL(10,2)` (`amount: BigDecimal`):
- `topup`: Positiv (`+amount`)
- `payout`: Negativ (`-amount`)
- `purchase` (im Modus `credit`): Negativ (`-amount`)
- `correction`: Hebt den Betrag der Originalbuchung umgekehrt auf (`-original.amount`)

### 2. Deckungsbeitrag & Event-Gewinnermittlung
Für jeden getätigten Kauf (Getränk oder Speise) wird im Beleg-Snapshot der Reingewinn/Deckungsbeitrag fixiert:
```text
profit = unit_price - cost_price
```

In der Event-Gesamtabrechnung (`EventLedgerSummaryDto`) aggregiert der `LedgerService`:
- `revenueTotal`: Summe aller Brutto-Verkaufserlöse (`SUM(unit_price)`)
- `costTotal`: Summe des Wareneinsatzes (`SUM(cost_price)`)
- `profitTotal`: Gesamter Deckungsbeitrag des Events (`SUM(profit) = revenueTotal - costTotal`)
- `creditConsumptionTotal`: Gesamtsumme der über Mitgliedsguthaben bezahlten Käufe

---

## 📋 Datenstrukturen & DTOs

```kotlin
data class PurchaseSnapshotDto(
    val itemType: String = "DRINK", // "DRINK" | "FOOD"
    val drinkName: String? = null,
    val foodName: String? = null,
    val imageReference: String? = null,
    val barcode: String? = null,
    val unitPrice: BigDecimal,
    val costPrice: BigDecimal = BigDecimal.ZERO,
    val profit: BigDecimal = BigDecimal.ZERO,
    val currency: String,
    val catalogVersion: Int? = 1
)

data class LedgerEntryDto(
    val id: String,
    val entryType: String,
    val eventId: String?,
    val memberId: String,
    val memberDisplayName: String,
    val drinkId: String?,
    val foodId: String? = null,
    val amount: BigDecimal,
    val currency: String,
    val accountingMode: String,
    val source: String?,
    val actorId: String,
    val reversesEntryId: String?,
    val idempotencyKey: String,
    val createdAt: Instant,
    val snapshot: PurchaseSnapshotDto?
)

data class EventLedgerSummaryDto(
    val eventId: String,
    val currency: String,
    val revenueTotal: BigDecimal,
    val costTotal: BigDecimal = BigDecimal.ZERO,
    val profitTotal: BigDecimal = BigDecimal.ZERO,
    val creditConsumptionTotal: BigDecimal,
    val entryCount: Int
)
```

---

## 🔄 Sequenzablauf: Idempotenter Barcode-Kauf

```mermaid
sequenceDiagram
    autonumber
    actor Member as Mitglied (PWA)
    participant Spring as LedgerController / LedgerService
    participant IdemRepo as IdempotencyRepository
    participant DB as LedgerRepository (PostgreSQL)

    Member->>Spring: POST /api/v1/ledger/purchases<br/>Header: Idempotency-Key: 7b8e2f...<br/>Body: { eventId, barcode: "4001686301234" }
    Spring->>IdemRepo: findByScopeAndKey("ledger:purchase", "7b8e2f...")
    alt Schlüssel bereits vorhanden (Retry-Fall)
        IdemRepo-->>Spring: IdempotencyRecord (Vorherige Response)
        Spring-->>Member: 201 Created (Gleiche LedgerEntryDto wie zuvor)
    else Neuer Request
        Spring->>DB: Finde EventDrink & DrinkSnapshot zum Barcode
        Spring->>DB: INSERT INTO ledger_entries (id, member_id, amount = -2.50, currency = 'EUR', entry_type = 'purchase', ...)
        Spring->>DB: INSERT INTO purchase_snapshots (ledger_entry_id, item_type = 'DRINK', drink_name = "Club Mate", unit_price = 2.50, cost_price = 1.00, profit = 1.50)
        Spring->>IdemRepo: INSERT INTO idempotency_records (scope, key, response_body)
        DB-->>Spring: Transaction Committed
        Spring-->>Member: 201 Created (Neuer LedgerEntryDto)
    end
```
