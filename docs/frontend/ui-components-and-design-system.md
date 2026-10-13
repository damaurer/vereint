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

### 11. `IconComponent` (`icon.component.ts`, `icons.ts`)
- **Zweck**: Eigenes Vereint-Icon-Set statt Emojis für Navigation, Buttons, Statuskacheln und Hinweise.
- **Stil**: 24er-Raster, 1,75er Linie, runde Enden und Ecken. Fast jedes Icon trägt einen gefüllten „Knoten“ aus der Bildmarke (Tür beim Haus, Klöppel der Glocke, Datenpunkte der Statistik, Regler der Administration).
- **Nutzung**: `<vereint-icon name="wallet" />` ist dekorativ und skaliert mit der Schriftgröße; `[size]="28"` setzt Pixel, `label="Mitteilungen"` macht es zu einem benannten Bild für Screenreader. Farbe kommt über `color` (`currentColor`).
- **Neue Icons**: In `icons.ts` als Formen-Daten ergänzen (kein `innerHTML`, SSR-sicher). Der Test `icon.component.spec.ts` prüft, dass alles im 24er-Raster liegt.
- **Emojis** bleiben dort, wo sie Inhalt sind (Reaktionen im Chat, Moments-Rituale), nicht als Bedienelement.

## 🧭 Navigation (`webservice/src/app/shell`)

`nav-model.ts` ist die einzige Quelle für alle Ziele, gruppiert in **Verein**, **Mein Konto**, **Theke** und **Verwaltung** (nur mit Rolle/Permission).

| Gerät | Darstellung |
| :--- | :--- |
| Handy | Kopfzeile mit Seitentitel und Mitteilungen; unten Start, Events, Chat, Guthaben und **Mehr** (Sheet mit allen übrigen Seiten und Abmelden). |
| Tablet | Beschriftete Icon-Leiste mit denselben vier Zielen plus **Mehr**; Kopfzeile mit Profil-Menü. |
| Desktop | Gruppierte Seitenleiste mit allen Seiten; Kopfzeile mit Seitentitel, Mitteilungen und Profil-Menü (Profil, Guthaben, Abmelden). |

Der Seitentitel in der Kopfzeile kommt aus `route.data.title`; Titel und Navigationslabel sollen gleich lauten.

## 📱 App-Icons (`webservice/public`)

- `vereint-app-icon.svg`: Favicon und App-Icon, gefüllte Fläche im Markenverlauf mit weißer Bildmarke (bleibt bei 16 px lesbar).
- `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `icons/apple-touch-icon.png`: Homescreen-Icons, eingebunden über `manifest.webmanifest` und `index.html`.
