# Fachdomäne: Kassenbuch & Finanzwesen (Ledger)

Das Kassenbuch in **Vereint** bildet das finanzielle Herzstück für Guthabenverwaltung, Getränkeabrechnungen und Event-Umsätze. Es folgt strengen Buchhaltungsprinzipien (*Double-Entry Journal*, *Append-Only Revisionssicherheit*, *Idempotenz*).

---

## 🎯 Fachliche Sicht (Business Domain)

### Buchungsarten & Geldflüsse
Das System unterscheidet vier elementare Buchungstypen (`entryType`):

1. **Guthaben-Aufladung (`topup`)**:
   - Einzahlung eines Mitglieds (z. B. Bargeld an den Kassier oder Überweisung).
   - Erhöht das persönliche Guthaben (`creditBalance`).
2. **Getränke-/Eventkauf (`purchase`)**:
   - Abbuchung für konsumierte Getränke am Theken-Tablet oder via PWA-Barcodescan.
   - Verringert das Guthaben im Modus `credit` oder wird als Bareinnahme im Modus `revenueOnly` verbucht.
3. **Guthaben-Auszahlung (`payout`)**:
   - Rückzahlung von verbleibendem Restguthaben bei Vereinsaustritt.
   - Verringert das Guthaben.
4. **Korrekturbuchung / Stornierung (`correction`)**:
   - Revisionssichere Gegenbuchung zu einer früheren Fehlbuchung.
   - Da Einträge niemals gelöscht werden dürfen (*Append-Only*), hebt ein Storno den Ursprungsbetrag über einen referenzierten Gegeneintrag auf.

### Abrechnungsmodi (`accountingMode`)
- **`credit`**: Der Kaufbetrag wird direkt dem persönlichen Vereinskonto des Mitglieds belastet.
- **`revenueOnly`**: Der Umsatz wird statistisch und kassenmäßig erfasst (z. B. bei Barzahlung auf Events oder Pauschalbuchungen), ohne ein Mitgliedskonto zu belasten.

---

## ⚙️ Technische Sicht (Architecture & Implementation)

### 1. Relevante Komponenten & Klassen
- **Controller**: `de.maurer.baseservice.controller.LedgerController`
  - `GET /api/v1/ledger/members/{memberId}/balance` – Aktueller Kontostand (`MemberBalanceDto`)
  - `GET /api/v1/ledger/members/{memberId}/entries` – Revisionssicherer Kontoauszug
  - `GET /api/v1/ledger/events/{eventId}/summary` – Gesamtabrechnung eines Events (`EventLedgerSummaryDto`)
  - `POST /api/v1/ledger/purchases` – PWA Barcode-Kauf (`PurchaseRequest`, erfordert `Idempotency-Key`)
  - `POST /api/v1/ledger/topups` – Guthabenaufladung (nur Vorstand/Admin)
  - `POST /api/v1/ledger/payouts` – Guthabenauszahlung (nur Vorstand/Admin)
  - `POST /api/v1/ledger/corrections` – Gegenbuchung/Storno (`CorrectionRequest`)
- **Service**: `LedgerService`
  - Berechnet Salden über aggregierte SQL-Summenabfragen.
  - Speichert `PurchaseSnapshot`-Objekte mit fixem Getränkepreis zum Kaufzeitpunkt.
  - Prüft und persistiert Idempotenzschlüssel in `idempotency_records`.
- **Datenbank & Entitäten**:
  - `LedgerEntry`, `PurchaseSnapshot`, `IdempotencyRecord` (in `LedgerEntities.kt`).
  - PostgreSQL Append-Only Trigger `trg_ledger_entries_append_only`.

---

## 💰 Saldenberechnung & Formel

```text
creditBalance = topupTotal - payoutTotal - (creditPurchases) ± (correctionTotal)
```

Jeder Buchungsdatensatz speichert den Betrag als `DECIMAL(10,2)` (`amount: BigDecimal`):
- `topup`: Positiv (`+amount`)
- `payout`: Negativ (`-amount`)
- `purchase` (im Modus `credit`): Negativ (`-amount`)
- `correction`: Hebt den Betrag der Originalbuchung umgekehrt auf (`-original.amount`)

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
        Spring->>DB: INSERT INTO purchase_snapshots (ledger_entry_id, drink_name = "Club Mate", unit_price = 2.50)
        Spring->>IdemRepo: INSERT INTO idempotency_records (scope, key, response_body)
        DB-->>Spring: Transaction Committed
        Spring-->>Member: 201 Created (Neuer LedgerEntryDto)
    end
```
