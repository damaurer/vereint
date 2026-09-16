# UI-Komponentenbibliothek & Optimus Design-System

Die Benutzeroberfläche von **Vereint** basiert auf dem **Optimus Design System** – einem hochgradig konsistenten, barrierefreien und modularen Komponenten-Ökosystem in Angular 22.

---

## 🎨 Optimus Design Tokens (`styles.css`)

Das Design-System definiert CSS Custom Properties für ein einheitliches Erscheinungsbild und einfache Theme-Anpassbarkeit pro Vereinsinstanz:

| Token-Kategorie | CSS Variable | Standardwert / Zweck |
| :--- | :--- | :--- |
| **Primärfarbe** | `--opt-color-primary` | Vereins-Hauptfarbe (z. B. `#1e3a8a`) für Buttons, Header und aktive Navigationselemente. |
| **Akzentfarbe** | `--opt-color-accent` | Hervorhebungen (z. B. `#d97706`) für Badges, Warnungen und Runden. |
| **Erfolg & Guthaben** | `--opt-color-success` | `#16a34a` für positive Kassenstände, Buchungsbestätigungen und Zusagen. |
| **Gefahr & Minusstand** | `--opt-color-danger` | `#dc2626` für negative Kassenstände, Stornos und Absagen. |
| **Hintergründe** | `--opt-bg-canvas`, `--opt-bg-surface` | Neutrales Weiß/Grau bzw. Dark-Mode Surface Farbwerte. |
| **Typografie** | `--opt-font-sans`, `--opt-font-mono` | System-Schriftarten mit optimaler Lesbarkeit auf Mobilgeräten. |
| **Radien** | `--opt-radius-sm`, `--opt-radius-md`, `--opt-radius-lg` | `4px`, `8px`, `16px` für Cards, Badges und Modals. |
| **Schatten** | `--opt-elevation-1` bis `--opt-elevation-4` | Tiefe- und Schattierungs-Ebenen für schwebende Overlays und Sheets. |

---

## 🧩 Shared UI-Komponenten (`webservice/src/app/ui`)

Alle UI-Komponenten sind als **Angular Standalone Components** ohne externe UI-Framework-Abhängigkeiten (kein Bootstrap, kein Material-Overhead) implementiert:

### 1. `BalanceCardComponent` (`balance-card.component.ts`)
- **Zweck**: Prominente Anzeige des aktuellen Kassenstands eines Mitglieds im Dashboard.
- **Features**:
  - Dynamische Farbgebung: Grün bei positivem Guthaben, Rot mit Warnhinweis bei negativem Kontostand.
  - Direkte Aktionsbuttons für "Guthaben aufladen" und "Kontoauszug anzeigen".

### 2. `BottomSheetComponent` (`bottom-sheet.component.ts`)
- **Zweck**: Mobile-First Interaktions-Drawer für Aktionen, Filter und Schnellauswahlen.
- **Features**:
  - Wisch-Geste (*Swipe down to dismiss*).
  - Touch-optimierte Backdrop-Abschirmung mit Fokus-Sperre (*Focus Trap*).

### 3. `ModalComponent` (`modal.component.ts`)
- **Zweck**: Zentrierte Dialoge für Bestätigungen, Vorschläge und Formulare auf Desktop und Tablet.
- **Features**: Tastatur-Support (`Escape`-Taste), ARIA-Attribute (`role="dialog"`), anpassbare Footer-Aktionen.

### 4. `StepperComponent` (`stepper.component.ts`)
- **Zweck**: Geführte Mehrschritt-Assistenten (z. B. Event-Erstellung mit Sublisten-Auswahl und Einladungs-Setup).
- **Features**: Schritt-Validierung, lineare oder freie Navigation, Fortschrittsbalken.

### 5. `DataTableComponent` (`data-table.component.ts`)
- **Zweck**: Wiederverwendbare, responsive Datentabelle für Mitgliederlisten, Getränkekataloge und Kassenjournale.
- **Features**: Client-/Serverseitiges Sortieren, Volltextsuche, dynamische Spalten-Templates und Paginierung.

### 6. `RoleChipComponent` (`role-chip.component.ts`)
- **Zweck**: Kompakte Kennzeichnung von Benutzerrollen und Vorstandsämtern (`Admin`, `Vorstand`, `Kassier`, `Thekenschreiber`).

### 7. `StatCardComponent` (`stat-card.component.ts`)
- **Zweck**: Dashboard-KPI-Kachel für Kennzahlen (z. B. Umsatz, Anwesenheit, Liter Bier).
- **Features**: Unterstützt Trendpfeile (`+14 %`), Sparklines und Vergleichswerte.

### 8. `StatusBadgeComponent` (`status-badge.component.ts`)
- **Zweck**: Statusanzeige für Eventzustände (`draft`, `published`, `active`, `completed`) und RSVP-Stati.

### 9. `HeroGreetingComponent` (`hero-greeting.component.ts`)
- **Zweck**: Personalisierte Begrüßung im Member-Dashboard ("Guten Abend, Max!") mit direktem Zugriff auf anstehende Events.

### 10. `AvatarBadgeComponent` (`avatar-badge.component.ts`)
- **Zweck**: Rundes Profilbild mit Initialen-Fallback und Statuspunkt.
