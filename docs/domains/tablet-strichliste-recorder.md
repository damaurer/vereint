# Fachdomäne: Tablet Strichlisten-Recorder (Kiosk Mode)

Der Tablet Strichlisten-Recorder in **Vereint** ist für den hochfrequenten Thekenbetrieb auf Festen, Feiern und Mitgliederversammlungen optimiert. Er bietet eine touch-optimierte Kiosk-Oberfläche zur blitzschnellen 1-Tap-Getränke- und Speisenbuchung, Rundenabrechnung und zum Abendabschluss.

---

## 🎯 Fachliche Sicht (Business Domain)

### 1. Kiosk-Modus & Theken-Bedienung
- **Strichliste nach Kategorien**:
  - Die Ansicht ist ein Raster wie auf der Papier-Strichliste: eine Zeile je aktivem Teilnehmer des Events, eine Spalte je Strich-Kategorie der Gruppe (Name und Preis je Strich im Spaltenkopf, Reihenfolge wie vom Vorstand festgelegt).
  - Ein Tipp in ein Feld bucht einen Strich auf das Guthaben der Person (`accountingMode = credit, source = tabletManual`). Jeder Strich nennt ein konkretes Getränk **und** die Kategorie; der Betrag ist der Kategoriepreis.
  - Enthält die Kategorie im Event genau ein Getränk, bucht der Tipp sofort. Bei mehreren öffnet sich eine Auswahl dieser Getränke. Ist im Event kein Getränk der Kategorie freigegeben, erscheint ein Hinweis und nichts wird gebucht.
  - Die Spalte **Sonstiges** erscheint, wenn das Event Getränke ohne Strich-Kategorie oder Speisen hat. Der Tipp öffnet die Auswahl dieser Artikel mit ihrem eigenen Preis.
  - Die Felder zeigen die Striche als Fünferbündel und die Zahl. Gezählt werden alle nicht stornierten Käufe des Events je Person (`GET …/board`), also auch die anderer Geräte, früherer Sitzungen und Barcode-Käufe am Handy. Nach jeder Buchung zählt die Oberfläche sofort hoch und gleicht danach mit dem Server ab.
  - Rechts stehen Zahl der Striche und Umsatz des Abends.
- **Rückgängig**: Nach jedem Strich zeigt ein Balken die letzte Buchung („Strich: Name · Kategorie (Getränk)“) mit **Rückgängig**. Zurücknehmen lassen sich die Striche der laufenden Sitzung, jeweils innerhalb von 10 Minuten, als Korrekturbuchung.
- **Preis im Event**: Kategoriepreis vor Eventpreis vor Getränkepreis, siehe [Getränkekatalog](drink-catalog-and-sublists.md#3-strich-kategorien-spalten-der-strichliste).
- **Kombiniertes Sortiment (`/items`)**:
  - Der Endpunkt `/api/v1/tablet/events/{eventId}/items` liefert in einer Abfrage alle freigegebenen Event-Getränke (`drinks`) und Event-Speisen (`food`). Daraus entsteht die Auswahl unter „Sonstiges“.
- **Runden-Erfassung (`round`)**:
  - Ermöglicht das gleichzeitige Buchen eines Getränks oder einer Speise für eine Gruppe ausgewählter Mitglieder (`memberIds`).
  - Wird als `revenueOnly`-Buchung erfasst und belastet die Kasse bzw. den Rundengeber ohne negative Einzelbelastungen.
- **Abendabschluss & Bareinnahmen (`evening`)**:
  - Erfassung von pauschalen Einnahmen oder Abrechnungen am Ende eines Festabends (`source = evening, accountingMode = revenueOnly`).

- **Gesperrter Kiosk-Modus mit PIN**:
  - Am Terminal startet „Kiosk-Modus starten“ den Modus. Dabei vergibt das Gerät seine eigene PIN (4–8 Ziffern) und optional einen Gerätenamen. Der Server legt eine Kiosk-Sitzung an (`kiosk_sessions`) und speichert nur den BCrypt-Hash der PIN.
  - Der Zustand liegt im `localStorage` des Geräts (`vereint.kiosk`, mit der Sitzungs-ID). Neuladen, Schließen und Neuöffnen von Tab, App oder Browser landen wieder im Terminal, beim zuletzt gewählten Event.
  - Solange er aktiv ist, leitet `kioskGuard` jede andere Seite auf `/tablet` um; Navigation, Mitteilungen und Abmelden sind ausgeblendet.
  - Verlassen am Gerät geht nur über das Schloss oben rechts oder „Kiosk-Modus verlassen“ und die vom Server bestätigte PIN. Nach 5 falschen Eingaben ist die Prüfung für diese Sitzung gesperrt (1, 5, 15, danach 60 Minuten).
  - Vorstand und Administration sehen unter *Vorstand → Kiosk-Geräte* alle laufenden Geräte und entsperren jedes jederzeit ohne PIN. Das Gerät gleicht alle 15 Sekunden und beim Zurückkehren in den Vordergrund ab und verlässt den Modus; Netzfehler lassen ihn bestehen.
  - Start, Fernentsperrung und PIN-Sperren stehen im Audit-Protokoll.
  - Das Schließen des Browsers oder ein App-Wechsel lässt sich aus einer Web-App nicht verhindern. Dafür das Gerät festsetzen: Android „Bildschirm fixieren“ (App-Pinning), iOS/iPadOS „Geführter Zugriff“.

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
    - `GET /api/v1/tablet/events/{eventId}/board` – Strichliste des Abends (`TabletBoardDto`)
    - `POST /api/v1/tablet/events/{eventId}/purchases` – Einzelkauf buchen (`TabletPurchaseRequest`, `eventDrinkId` oder `eventFoodId`)
    - `POST /api/v1/tablet/events/{eventId}/purchases/{entryId}/undo` – Strich innerhalb von 10 Minuten zurücknehmen
    - `POST /api/v1/tablet/events/{eventId}/rounds` – Rundenbuchung (`TabletRevenuePurchaseRequest`)
    - `POST /api/v1/tablet/events/{eventId}/evening` – Abendabschlussbuchung
  - `TabletRecorderService`: Validiert Event-Status (`active`), Event-Artikel-Zuordnung und delegiert Buchungen (`recordTabletPurchase` / `recordTabletFoodPurchase`) an den `LedgerService`.
  - Berechtigung: Erfordert Rolle `tabletRecorder` oder Berechtigung `purchase.tablet`.
- **Frontend (Angular)**:
  - `webservice/src/app/tablet/tablet.component.ts` – Haupt-Container mit Eventauswahl, Raster, Buchung und Rückgängig.
  - `tally-grid.component.ts` – Raster Mitglied × Strich-Kategorie; meldet den Tipp auf ein Feld.
  - `tally-marks.component.ts` – Striche als Fünferbündel.
  - `tally-picker.component.ts` – Auswahl des Getränks in einer Kategorie bzw. der Artikel unter „Sonstiges“.
  - `drink-overlay.component.ts` – Touch-Modal zur Artikelwahl für Runde und Abend.
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

// Strichliste des Abends
data class TabletBoardDto(
    val columns: List<TabletBoardColumnDto>,   // Strich-Kategorien mit Getränken im Event
    val members: List<TabletBoardMemberDto>,
    val tallyCount: Int,                       // Striche des Abends
    val revenue: BigDecimal,                   // Umsatz des Abends
    val currency: String
)

data class TabletBoardColumnDto(
    val categoryId: String,
    val name: String,
    val price: BigDecimal,                     // Preis je Strich
    val currency: String,
    val drinks: List<TabletBoardDrinkDto>      // eventDrinkId, drinkName
)

data class TabletBoardMemberDto(
    val memberId: String,
    val displayName: String,
    val counts: Map<String, Int>,              // Striche je categoryId
    val otherCount: Int                        // Striche unter „Sonstiges“
)
```

---

## 🔄 Sequenzablauf: Strich in einer Kategorie

```mermaid
sequenceDiagram
    autonumber
    actor Bartender as Thekendienst (Tablet)
    participant UI as TabletComponent / TallyGrid
    participant BFF as Express BFF
    participant Spring as TabletRecorderController
    participant Ledger as LedgerService
    participant DB as PostgreSQL

    Bartender->>UI: Tippt auf das Feld "Max Mustermann" × "Bier"
    alt mehrere Getränke in der Kategorie
        UI->>Bartender: Auswahl "Bier: welches Getränk?"
        Bartender->>UI: Tippt auf "Helles 0,5 l"
    end
    Note over UI: Zählt das Feld sofort hoch, erzeugt den Idempotency-Key
    UI->>BFF: POST /api/v1/tablet/events/{id}/purchases (memberId, eventDrinkId)
    BFF->>Spring: POST /api/v1/tablet/events/{id}/purchases<br/>Header: Idempotency-Key: c9d1a...
    Spring->>Spring: Prüft Berechtigung ('purchase.tablet') & Event-Status ('active')
    Spring->>Ledger: Bucht den Strich (EventDrinkPricing: Kategoriepreis 3,00 €)
    Ledger->>DB: INSERT INTO ledger_entries (drink_id, tally_category_id, amount = 3.00) & purchase_snapshots
    DB-->>Ledger: Committed
    Ledger-->>Spring: LedgerEntryDto (tallyCategoryName = "Bier")
    Spring-->>BFF: 201 Created
    BFF-->>UI: 201 Created
    UI->>Bartender: Balken "Strich: Max Mustermann · Bier (Helles 0,5 l)" mit Rückgängig
    UI->>BFF: GET /api/v1/tablet/events/{id}/board (Abgleich)
```
