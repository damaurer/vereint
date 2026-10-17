# Fachdomäne: Speisenkatalog & Eventspeisen

Die Speisenverwaltung in **Vereint** ermöglicht die strukturierte Verwaltung von Verzehrangeboten – vom Speisenkatalog der Gruppe bis hin zum veranstaltungsspezifischen Speisenangebot mit individueller Preisanpassung und Kiosk-Steuerung.

---

## 🎯 Fachliche Sicht (Business Domain)

### 1. Speisenkatalog der Gruppe (`food_catalog`)
- **Stammdatenverwaltung**: Zentrales Sortiment aller in der Gruppe zubereiteten oder angebotenen Speisen (z. B. Grillgut, Kuchen, Brezeln, Snacks, vegetarische/vegane Optionen).
- **Attribute**:
  - Name, Beschreibung und Kategorie (z. B. `Grill`, `Kuchen`, `Snacks`).
  - Standard-Verkaufspreis (`defaultPrice: BigDecimal`) und Standard-Einkaufspreis (`costPrice: BigDecimal`).
  - Währung (`currency: String`, z. B. `EUR`).
  - Status (`active: Boolean`) zur Deaktivierung saisonaler oder nicht mehr angebotener Speisen.
  - Ersteller-Referenz (`created_by`) für Revisions- und Audit-Zwecke.
- **Berechtigungen**:
  - Speisenkatalog ansehen: Alle Mitglieder der Gruppe sehen aktive Speisen; inaktive sieht nur, wer `catalog.approve` hat (Startwert: Vorstand und Admin).
  - Speisen anlegen & bearbeiten: nur mit `catalog.approve`.

### 2. Eventspezifische Speisen (`event_food`)
- **Veranstaltungsbezogenes Angebot**: Jedes Event stellt eine eigene Auswahl an Speisen aus dem Katalog der Gruppe zusammen; jede Speise höchstens einmal je Event.
- **Preis- & Margen-Flexibilität**:
  - **Verkaufspreis (`price` / `effectivePrice`)**: Kann pro Event individuell festgelegt werden (z. B. Sonderpreise für Sommerfest). Bleibt `price` leer (`null`), greift automatisch der `defaultPrice` des Katalogs.
  - **Einkaufspreis (`costPrice` / `effectiveCostPrice`)**: Kann eventbezogen angepasst werden (z. B. bei tagesaktuellen Metzgereipreisen). Bleibt `costPrice` leer, gilt der Katalogwert.
- **Kanal- und Kiosk-Steuerung**:
  - `tabletEnabled: Boolean`: Steuert die Anzeige auf dem Tablet Strichlisten-Recorder an der Theke/Küche.
  - `selfServiceEnabled: Boolean`: wird gespeichert; Barcode-Käufe in der App betreffen derzeit nur Getränke.
- **Berechtigungen**:
  - Eventspeisen verwalten (`POST`, `PUT`, `DELETE`): Veranstalter und wer `event.manage` hat.
  - Eventspeisen abrufen (`GET /api/v1/events/{eventId}/food`): Veranstalter, Eingeladene und wer `event.manage` hat; die Theke liest sie über `/api/v1/tablet/events/{eventId}/food` bzw. `/items` (`purchase.tablet`).

---

## ⚙️ Technische Sicht (Architecture & Implementation)

### 1. Relevante Komponenten & Klassen
- **Controller**:
  - `FoodCatalogController`: Endpunkte unter `/api/v1/food` für Stammdatenverwaltung.
  - `EventFoodController`: Endpunkte unter `/api/v1/events/{eventId}/food` für veranstaltungsbezogene Speisen.
- **Services**:
  - `FoodCatalogService`: Validiert Namensregeln, Preise, Dezimalstellen und Berechtigungen (`catalog.approve`).
  - `EventFoodService`: Prüft Event-Existenz, Berechtigungen (Veranstalter oder `event.manage`), Dubletten-Schutz (`uk_event_food_event_food`) und berechnet effektive Preise (`effectivePrice`, `effectiveCostPrice`).
- **Repositories**: `FoodCatalogRepository`, `EventFoodRepository`.
- **Entitäten**: `FoodCatalogEntity`, `EventFoodEntity` (in `FoodEntities.kt`).

---

## 📋 Datenstrukturen & DTOs

```kotlin
// Globaler Speisenkatalog
data class CreateFoodRequest(
    @field:NotBlank val name: String?,
    @field:Size(max = 4000) val description: String? = null,
    @field:Size(max = 64) val category: String? = null,
    @field:NotNull @field:DecimalMin("0.00") val defaultPrice: BigDecimal?,
    @field:DecimalMin("0.00") val costPrice: BigDecimal? = null,
    @field:Pattern(regexp = "^[A-Za-z]{3}$") val currency: String? = null
)

data class UpdateFoodRequest(
    @field:Size(min = 1, max = 255) val name: String? = null,
    @field:Size(max = 4000) val description: String? = null,
    @field:Size(max = 64) val category: String? = null,
    @field:DecimalMin("0.00") val defaultPrice: BigDecimal? = null,
    @field:DecimalMin("0.00") val costPrice: BigDecimal? = null,
    @field:Pattern(regexp = "^[A-Za-z]{3}$") val currency: String? = null,
    val active: Boolean? = null
)

data class FoodDto(
    val id: String,
    val name: String,
    val description: String?,
    val category: String?,
    val defaultPrice: BigDecimal,
    val costPrice: BigDecimal,
    val currency: String,
    val active: Boolean,
    val createdById: String?,
    val createdAt: Instant,
    val updatedAt: Instant
)

// Eventspeisen
data class AddEventFoodRequest(
    @field:NotBlank val foodId: String?,
    @field:DecimalMin("0.00") val price: BigDecimal? = null,
    @field:DecimalMin("0.00") val costPrice: BigDecimal? = null,
    @field:Pattern(regexp = "^[A-Za-z]{3}$") val currency: String? = null,
    val selfServiceEnabled: Boolean? = null,
    val tabletEnabled: Boolean? = null
)

data class UpdateEventFoodRequest(
    @field:DecimalMin("0.00") val price: BigDecimal? = null,
    @field:DecimalMin("0.00") val costPrice: BigDecimal? = null,
    @field:Pattern(regexp = "^[A-Za-z]{3}$") val currency: String? = null,
    val selfServiceEnabled: Boolean? = null,
    val tabletEnabled: Boolean? = null
)

data class EventFoodDto(
    val id: String,
    val eventId: String,
    val foodId: String,
    val foodName: String,
    val price: BigDecimal?,
    val effectivePrice: BigDecimal,
    val costPrice: BigDecimal?,
    val effectiveCostPrice: BigDecimal,
    val currency: String,
    val selfServiceEnabled: Boolean,
    val tabletEnabled: Boolean,
    val createdAt: Instant,
    val updatedAt: Instant
)
```

---

## 🔄 Sequenzablauf: Speisenzuweisung zu einem Event

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Veranstalter / Vorstand
    participant Spring as EventFoodController / Service
    participant DB as PostgreSQL (event_food)

    Owner->>Spring: POST /api/v1/events/{eventId}/food (foodId: "...", price: 3.50, costPrice: 1.20)
    Note over Spring: Prüft Rechte (Veranstalter oder event.manage), Speise und Dubletten
    Spring->>DB: INSERT INTO event_food (event_id, food_id, price, cost_price, tablet_enabled = true)
    DB-->>Spring: Committed
    Spring-->>Owner: 201 Created (EventFoodDto: effectivePrice = 3.50, effectiveCostPrice = 1.20)
```
