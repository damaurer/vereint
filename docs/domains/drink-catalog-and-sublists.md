# Fachdomäne: Getränkekatalog & Sublisten

Die Getränkeverwaltung in **Vereint** bildet das Sortiment einer Gruppe ab: vom Katalog der Gruppe über Sublisten bis zur Getränkeauswahl je Event. Ergänzt wird sie durch die gemeinsame Getränkedatenbank aller Gruppen.

---

## 🎯 Fachliche Sicht (Business Domain)

### 1. Getränkekatalog der Gruppe & Vorschlagsworkflow
- **Katalog**: Verzeichnis aller in der Gruppe verfügbaren Getränke mit Name, Beschreibung, Kategorie (z. B. Bier, Softdrinks, Heißgetränke), Standard-Verkaufspreis (`defaultPrice: BigDecimal`), Einkaufspreis (`costPrice: BigDecimal`), Währung (`currency: String`, z. B. `EUR`), Bildreferenz und Barcode(s).
- **Einkaufspreise & Wirtschaftlichkeit**: Die Pflege von `costPrice` ermöglicht exakte Deckungsbeitrags- und Gewinnrechnungen (`profit = unitPrice - costPrice`) pro Event und Verkaufskanal.
- **Vorschlags- & Freigabeprozess**:
  1. Wer `catalog.propose` hat (Startwert: alle Mitglieder), schlägt neue Getränke vor (`status = proposed`, erfasst `proposed_by`).
  2. Wer `catalog.approve` hat (Startwert: Vorstand und Admin), gibt das Getränk frei (`status = approved`, erfasst `approved_by`) oder lehnt es ab (`status = rejected`).
  3. Nur freigegebene Getränke können in Sublisten aufgenommen werden; ins Event-Angebot kommen nur freigegebene und aktive.
  4. Legt jemand mit `catalog.approve` ein Getränk selbst an, ist es sofort freigegeben und aktiv (`approved_by` = Anlegende); ein zweiter Freigabeschritt entfällt.
  5. Ohne `catalog.approve` sieht man im Katalog nur freigegebene Getränke und die eigenen Vorschläge; eigene Vorschläge darf man bearbeiten und mit Barcodes versehen.
- **Erfassung in der Oberfläche** (`/catalog`):
  - „Barcode scannen“: Ein bekannter Barcode öffnet das Getränk, ein unbekannter das Formular „Getränk anlegen“ mit vorausgefülltem Code.
  - Ein Formular für Anlegen, Vorschlagen und Bearbeiten: Name, Kategorie (Vorschläge aus vorhandenen Kategorien), Verkaufs- und Einkaufspreis mit Marge (Einkaufspreis nur mit `catalog.approve`), Beschreibung, beliebig viele Barcodes per Kamera oder Eingabe.
  - Vor dem Speichern wird geprüft, ob ein Barcode schon zu einem anderen Getränk gehört und ob es ein Getränk gleichen Namens gibt.
  - „Im Sortiment“ nimmt ein Getränk aus dem Verkauf (`active = false`), ohne es zu löschen; die Karte zeigt dann „Inaktiv“.
  - „Aus der Getränkedatenbank“ (`/catalog/library`) übernimmt ein Getränk aus der gemeinsamen Datenbank (Name, Kategorie, Beschreibung, Barcodes, ohne Preise); siehe [Gruppen](stammtische.md#gemeinsame-getränkedatenbank).

### 2. Event-Sublisten (Sortimentssteuerung) & Event-Getränke
- Nicht jedes Event bietet das gesamte Sortiment der Gruppe an.
- **Sublisten** definieren ausgewählte Teile des Sortiments (z. B. „Sommerfest“, „Jahrestreffen“). Jedes Mitglied kann Sublisten anlegen; ändern und löschen dürfen der Ersteller und wer `catalog.approve` hat.
- Innerhalb einer Subliste können Katalogpreise mit einem eigenen `default_price` überschrieben werden.
- Über `EventDrinkController` (`/api/v1/events/{eventId}/drinks/assign-sublist`) werden Sublisten an Events gekoppelt oder Einzelgetränke (`AddEventDrinkRequest`) mit festen Eventpreisen (`price`, `costPrice`), `selfServiceEnabled` und `tabletEnabled` zugewiesen. Das dürfen Veranstalter des Events und wer `event.manage` hat.


---

## ⚙️ Technische Sicht (Architecture & Implementation)

### 1. Relevante Komponenten & Klassen
- **Controller**:
  - `DrinkCatalogController`: Katalog der Gruppe (`GET /api/v1/drinks`, `GET /{id}`, `GET /barcode/{barcode}`), Vorschlag bzw. Anlage (`POST /api/v1/drinks`), Bearbeiten (`PUT /{id}`), Freigaben (`/{id}/approve`, `/{id}/reject`), Barcodes (`POST /{id}/barcodes`, `DELETE /{id}/barcodes/{barcodeId}`), Teilen in die Datenbank (`POST /{id}/share-to-library`).
  - `DrinkLibraryController`: gemeinsame Getränkedatenbank (`/api/v1/drink-library`).
  - `DrinkSublistController`: Verwaltung von Sublisten (`/api/v1/sublists`) und Artikeln (`/items`).
  - `EventDrinkController`: Eventbezogene Getränkeauswahl (`/api/v1/events/{eventId}/drinks`) und Sublistenzuweisung.
- **Services**: `DrinkCatalogService`, `DrinkSublistService`, `EventDrinkService`, `DrinkLibraryService`.
- **Entitäten**: `DrinkCatalogEntity`, `DrinkBarcodeEntity`, `DrinkSublistEntity`, `DrinkSublistItemEntity`, `EventDrinkEntity`; für die Datenbank `drink_library` und `drink_library_barcodes`.

---

## 📋 Datenstrukturen & DTOs

```kotlin
data class DrinkDto(
    val id: String,
    val name: String,
    val description: String?,
    val category: String?,
    val defaultPrice: BigDecimal,
    val costPrice: BigDecimal = BigDecimal.ZERO,
    val currency: String,
    val imageReference: String?,
    val catalogVersion: Int,
    val status: String,
    val active: Boolean,
    val proposedById: String?,
    val approvedById: String?,
    val barcodes: List<DrinkBarcodeDto>,
    val createdAt: Instant,
    val updatedAt: Instant,
    val libraryDrinkId: String? = null
)

data class ProposeDrinkRequest(
    @field:NotBlank val name: String?,
    @field:Size(max = 4000) val description: String? = null,
    @field:Size(max = 64) val category: String? = null,
    @field:NotNull @field:DecimalMin("0.00") val defaultPrice: BigDecimal?,
    @field:DecimalMin("0.00") val costPrice: BigDecimal? = null,
    @field:Pattern(regexp = "^[A-Za-z]{3}$") val currency: String? = null,
    @field:Size(max = 512) val imageReference: String? = null,
    @field:Size(max = 64) val barcodes: List<String>? = null,
    val libraryDrinkId: String? = null
)

data class EventDrinkDto(
    val id: String,
    val eventId: String,
    val drinkId: String,
    val drinkName: String,
    val price: BigDecimal,
    val costPrice: BigDecimal? = null,
    val effectiveCostPrice: BigDecimal = BigDecimal.ZERO,
    val currency: String,
    val selfServiceEnabled: Boolean,
    val tabletEnabled: Boolean,
    val catalogVersion: Int,
    val imageSnapshot: String?,
    val createdAt: Instant,
    val updatedAt: Instant
)
```

---

## 🔄 Sequenzablauf: Vorschlag & Freigabe eines Getränks

```mermaid
sequenceDiagram
    autonumber
    actor Member as Mitglied
    actor Board as Vorstand
    participant Spring as DrinkCatalogController / Service
    participant DB as PostgreSQL (drink_catalog)

    Member->>Spring: POST /api/v1/drinks (name, category, defaultPrice: 2.50, barcodes)
    Spring->>DB: INSERT INTO drink_catalog (status = 'proposed', default_price = 2.50, proposed_by = :memberId)
    DB-->>Spring: Created
    Spring-->>Member: 201 Created (DrinkDto: status = proposed)

    Board->>Spring: POST /api/v1/drinks/{id}/approve
    Spring->>DB: UPDATE drink_catalog SET status = 'approved', approved_by = :boardId WHERE id = :id
    DB-->>Spring: Updated
    Spring-->>Board: 200 OK (DrinkDto: status = approved)
```
