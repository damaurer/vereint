# Fachdomäne: Tablet Strichlisten-Recorder (Kiosk Mode)

Der Tablet Strichlisten-Recorder in **Vereint** ist für den hochfrequenten Thekenbetrieb auf Vereinsfesten, Feiern und Mitgliederversammlungen optimiert. Er bietet eine touch-optimierte Kiosk-Oberfläche zur blitzschnellen 1-Tap-Getränke- und Speisenbuchung, Rundenabrechnung und zum Abendabschluss.

---

## 🎯 Fachliche Sicht (Business Domain)

### 1. Kiosk-Modus & Theken-Bedienung
- **1-Tap Schnellbuchung**:
  - Thekenbediener sehen eine touch-optimierte Liste aller aktiven Vereinsmitglieder (`TabletMemberDto`).
  - Ein Antippen einer Mitgliedszeile öffnet das Artikel-Overlay mit Tabs für **Getränke** und **Speisen**.
  - Große Kachel-Buttons zeigen die für dieses Event freigeschalteten Artikel (`tabletEnabled = true`) mit Name und effektivem Preis.
  - Eine Artikelauswahl löst die sofortige Buchung auf das persönliche Vereinskonto aus (`accountingMode = credit, source = tabletManual`, `eventDrinkId` oder `eventFoodId`).
- **Kombiniertes Sortiment (`/items`)**:
  - Der Endpunkt `/api/v1/tablet/events/{eventId}/items` liefert in einer Abfrage alle freigegebenen Event-Getränke (`drinks`) und Event-Speisen (`food`) zur Minimierung von Latenzen.
- **Runden-Erfassung (`round`)**:
  - Ermöglicht das gleichzeitige Buchen eines Getränks oder einer Speise für eine Gruppe ausgewählter Mitglieder (`memberIds`).
  - Wird als `revenueOnly`-Buchung erfasst und belastet die Kasse bzw. den Rundengeber ohne negative Einzelbelastungen.
- **Abendabschluss & Bareinnahmen (`evening`)**:
  - Erfassung von pauschalen Einnahmen oder Abrechnungen am Ende eines Festabends (`source = evening, accountingMode = revenueOnly`).

### 2. Fehlertoleranz & Entlastung des Personals
- **Idempotenz-Schutz**: Bei unruhigem Netz oder versehentlichem Mehrfachtippen verhindert der `Idempotency-Key`-Header doppelte Abbuchungen.
- **Visuelle Buchungsbestätigung**: Diskrete Animationen und Ton-/Farbfeedback bestätigen jede Buchung in Millisekunden.

---

## ⚙️ Technische Sicht (Architecture & Implementation)

### 1. Relevante Komponenten & Klassen
- **Backend**:
  - `TabletRecorderController`: Endpunkte unter `/api/v1/tablet`
    - `GET /api/v1/tablet/events` – Liste aktiver Events für die Kioskauswahl
    - `GET /api/v1/tablet/events/{eventId}/members` – Aktive Teilnehmerliste
    - `GET /api/v1/tablet/events/{eventId}/drinks` – Verfügbare Event-Getränke
    - `GET /api/v1/tablet/events/{eventId}/food` – Verfügbare Event-Speisen
    - `GET /api/v1/tablet/events/{eventId}/items` – Kombinierte Getränke & Speisen (`TabletItemsDto`)
    - `POST /api/v1/tablet/events/{eventId}/purchases` – Einzelkauf buchen (`TabletPurchaseRequest`, `eventDrinkId` oder `eventFoodId`)
    - `POST /api/v1/tablet/events/{eventId}/rounds` – Rundenbuchung (`TabletRevenuePurchaseRequest`)
    - `POST /api/v1/tablet/events/{eventId}/evening` – Abendabschlussbuchung
  - `TabletRecorderService`: Validiert Event-Status (`active`), Event-Artikel-Zuordnung und delegiert Buchungen (`recordTabletPurchase` / `recordTabletFoodPurchase`) an den `LedgerService`.
  - Berechtigung: Erfordert Rolle `tabletRecorder` oder Berechtigung `purchase.tablet`.
- **Frontend (Angular)**:
  - `webservice/src/app/tablet/tablet.component.ts` – Haupt-Container mit Eventauswahl und Mitgliedsliste.
  - `drink-overlay.component.ts` – Touch-Modal zur Artikelwahl mit Tab-Umschaltung ("Getränke" / "Speisen").
  - `strichliste-row.component.ts` – Optimierte Tabellenzeile mit schnellem Touch-Handler.
  - `revenue-sheet.component.ts` – Übersicht der an diesem Abend getätigten Buchungen.

---

## 📋 Datenstrukturen & DTOs

```kotlin
data class TabletPurchaseRequest(
    @field:NotBlank(message = "memberId darf nicht leer sein")
    val memberId: String? = null,

    val eventDrinkId: String? = null,
    val eventFoodId: String? = null
)

data class TabletRevenuePurchaseRequest(
    val eventDrinkId: String? = null,
    val eventFoodId: String? = null,

    @field:NotEmpty(message = "memberIds darf nicht leer sein")
    val memberIds: List<String>? = null
)

data class TabletItemsDto(
    val drinks: List<EventDrinkDto>,
    val food: List<EventFoodDto>
)

data class TabletMemberDto(
    val memberId: String,
    val displayName: String
)
```

---

## 🔄 Sequenzablauf: 1-Tap Thekenbuchung (Getränk oder Speise)

```mermaid
sequenceDiagram
    autonumber
    actor Bartender as Thekenbediener (Tablet)
    participant UI as TabletComponent / DrinkOverlay
    participant BFF as Express BFF
    participant Spring as TabletRecorderController
    participant Ledger as LedgerService
    participant DB as PostgreSQL

    Bartender->>UI: Tippt auf "Max Mustermann"
    UI->>UI: Öffnet Overlay mit Tabs [Getränke] [Speisen]
    Bartender->>UI: Wählt Tab "Speisen" & tippt auf "Bratwurst (3,50 €)"
    Note over UI: Generiert UUIDv4 für Idempotency-Key
    UI->>BFF: POST /api/v1/tablet/events/{id}/purchases (memberId, eventFoodId)
    BFF->>Spring: POST /api/v1/tablet/events/{id}/purchases<br/>Header: Idempotency-Key: c9d1a...
    Spring->>Spring: Prüft Berechtigung ('purchase.tablet') & Event-Status ('active')
    Spring->>Ledger: Bucht Speiseneintrag (food_id, cost_price, profit, amount = -3.50)
    Ledger->>DB: INSERT INTO ledger_entries & purchase_snapshots (item_type = 'FOOD')
    DB-->>Ledger: Committed
    Ledger-->>Spring: LedgerEntryDto
    Spring-->>BFF: 201 Created
    BFF-->>UI: 201 Created
    UI->>Bartender: Grünes Feedback "+1 Bratwurst für Max gebucht"
```
