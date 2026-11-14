# UI-Komponentenbibliothek & Design-System

Die Benutzeroberfläche von **Vereint** nutzt die Bibliothek `@openng/optimus-ui` mit dem Theme Aura (`provideOptimus` in `app.config.ts`), Tailwind CSS 4 und eigene, schlanke Standalone-Komponenten unter `webservice/src/app/ui`.

---

## 🎨 Design Tokens (`styles.css`)

`styles.css` definiert CSS Custom Properties für ein einheitliches Erscheinungsbild, mit eigenen Werten für den Dunkelmodus:

| Token-Kategorie | CSS Variable | Standardwert / Zweck |
| :--- | :--- | :--- |
| **Primärfarbe** | `--opt-color-primary`, `--opt-color-primary-light`, `--opt-color-primary-dark` | Hauptfarbe (`#1e3a8a`) für Buttons, Header und aktive Navigationselemente. |
| **Akzentfarbe** | `--opt-color-accent`, `--opt-color-accent-light` | Hervorhebungen für Badges und Hinweise. |
| **Erfolg** | `--opt-color-success`, `--opt-color-success-light` | Positive Kontostände, Bestätigungen und Zusagen. |
| **Gefahr** | `--opt-color-danger`, `--opt-color-danger-light` | Negative Kontostände, Stornos und Absagen. |
| **Hintergründe** | `--opt-bg-canvas`, `--opt-bg-surface`, `--opt-bg-surface-raised` | Seiten- und Kartenflächen. |
| **Text & Rahmen** | `--opt-text-main`, `--opt-text-muted`, `--opt-border-color`, `--opt-border-dark` | Schrift- und Linienfarben. |
| **Typografie** | `--opt-font-sans` | System-Schriftarten. |
| **Radien** | `--opt-radius-sm`, `--opt-radius-md`, `--opt-radius-lg` | `4px`, `8px`, `12px`. |

---

## 🧩 Shared UI-Komponenten (`webservice/src/app/ui`)

Alle Komponenten sind **Angular Standalone Components** mit `OnPush`; Texte kommen über die `t`-Pipe aus `i18n/locales`.

### 1. `BalanceCardComponent` (`balance-card.component.ts`)
- **Zweck**: Anzeige eines Kontostands (`amount`), rot bei `negative`.
- **Optional**: Knopf „Aufladen“ (`showTopup`, Ereignis `topup`).

### 2. `BottomSheetComponent` (`bottom-sheet.component.ts`)
- **Zweck**: Von unten einfahrendes Blatt für Aktionen und Auswahlen auf dem Handy.
- **Verhalten**: `role="dialog"`, schließt per `Escape` oder Klick auf den Hintergrund (abschaltbar mit `dismissible=false`), Ereignis `closed`.

### 3. `ModalComponent` (`modal.component.ts`)
- **Zweck**: Zentrierte Dialoge für Bestätigungen und Formulare.
- **Verhalten**: `role="dialog"`, `aria-modal`, Schließen-Knopf, `Escape`, Klick auf den Hintergrund (abschaltbar mit `dismissible=false`).

### 4. `StepperComponent` (`stepper.component.ts`)
- **Zweck**: Mengenwahl mit „−“ und „+“ (`value`, `min`, `max`, `step`), z. B. an der Theke.
- **Ereignisse**: `valueChange`, `increased`, `decreased`; der Wert wird per `aria-live` angesagt.

### 5. `DataTableComponent` (`data-table.component.ts`)
- **Zweck**: Einfache Tabelle aus `columns` und `rows`, optional mit eigenem Zellen-Template.
- **Mobil**: Jede Zelle trägt `data-label` mit dem Spaltentitel; ohne Zeilen erscheint ein Leertext.

### 6. `RoleChipComponent` (`role-chip.component.ts`)
- **Zweck**: Kompakter Chip mit einem Text (`label`), optional hervorgehoben (`tone="accent"`), etwa für Rollen.

### 7. `StatCardComponent` (`stat-card.component.ts`)
- **Zweck**: Kachel mit Kennzahl (`label`, `value`), optional `hint` und Icon.

### 8. `StatusBadgeComponent` (`status-badge.component.ts`)
- **Zweck**: Farbiges Abzeichen mit Text und Ton (`tone`), z. B. für Event- und Zusagestatus.

### 9. `HeroGreetingComponent` (`hero-greeting.component.ts`)
- **Zweck**: Begrüßung im Dashboard mit Avatar, Name und optionalem Untertitel.

### 10. `AvatarBadgeComponent` (`avatar-badge.component.ts`)
- **Zweck**: Rundes Profilbild mit Initialen-Fallback (bis zu zwei Buchstaben).

### 11. `IconComponent` (`icon.component.ts`, `icons.ts`)
- **Zweck**: Eigenes Vereint-Icon-Set statt Emojis für Navigation, Buttons, Statuskacheln und Hinweise.
- **Stil**: 24er-Raster, 1,75er Linie, runde Enden und Ecken. Fast jedes Icon trägt einen gefüllten „Knoten“ aus der Bildmarke (Tür beim Haus, Klöppel der Glocke, Datenpunkte der Statistik, Regler der Administration).
- **Nutzung**: `<vereint-icon name="wallet" />` ist dekorativ und skaliert mit der Schriftgröße; `[size]="28"` setzt Pixel, `label="Mitteilungen"` macht es zu einem benannten Bild für Screenreader. Farbe kommt über `color` (`currentColor`).
- **Neue Icons**: In `icons.ts` als Formen-Daten ergänzen (kein `innerHTML`, SSR-sicher). Der Test `icon.component.spec.ts` prüft, dass alles im 24er-Raster liegt.
- **Emojis** bleiben dort, wo sie Inhalt sind (Reaktionen im Chat, Moments-Rituale), nicht als Bedienelement.

### 12. `StateComponent` (`state.component.ts`)
- **Zweck**: Eine Lade-, Leer- und Fehleranzeige für alle Seiten statt eigener `state-card`-Blöcke.
- **Nutzung**: `<vereint-state kind="loading" title="Wird geladen …" message="…" />`, `kind="empty"` für leere Listen, `kind="error"` mit `[message]="load.errorMessage()"` und `(retry)="reload()"`. Der Knopf „Erneut versuchen“ erscheint nur, wenn `retry` gebunden ist.
- **Barrierefreiheit**: Laden und Leer werden als `status` angesagt, Fehler als `alert`.

### 13. Weitere Bausteine
- `EventCardComponent` (`event-card.component.ts`): Karte für ein Event in Listen.
- `InfoPanelComponent` (`info-panel.component.ts`): Hinweisfläche mit Text.
- `resizeImageToJpeg` (`image-resize.ts`): verkleinert Bilder im Browser vor dem Upload.

## 🧭 Navigation (`webservice/src/app/shell`)

`nav-model.ts` ist die einzige Quelle für alle Ziele, gruppiert in **Gruppe**, **Mein Konto**, **Theke** und **Verwaltung** (nur mit passender Permission in der gewählten Gruppe).

| Gerät | Darstellung |
| :--- | :--- |
| Handy (≤ 640px) | Kopfzeile mit Seitentitel und Mitteilungen; unten Start, Events, Chat, Guthaben und **Mehr** (Sheet mit allen übrigen Seiten und Abmelden). |
| Tablet (641px bis 1024px) | Beschriftete Icon-Leiste mit denselben vier Zielen plus **Mehr**; Kopfzeile mit Profil-Menü. |
| Desktop (> 1024px) | Gruppierte Seitenleiste mit allen Seiten; Kopfzeile mit Seitentitel, Mitteilungen und Profil-Menü (Profil, Guthaben, Abmelden). |

Der Seitentitel in der Kopfzeile kommt aus `route.data.title`; Titel und Navigationslabel sollen gleich lauten.

Die Glocke zeigt die Zahl ungelesener Mitteilungen (`GET /api/v1/notifications/unread-count`). Der Wert liegt in `UnreadBadgeStore`, den auch die Mitteilungsseite beim Lesen aktualisiert.

## 🌗 Hell- und Dunkelmodus

`ThemeService` (`shell/theme.service.ts`) setzt `data-theme` auf `<html>`: „System“ entfernt das Attribut (dann gilt `prefers-color-scheme`), „Hell“ und „Dunkel“ setzen es fest. Die Wahl trifft man im Profil; sie liegt nur im Browser (`localStorage`, Schlüssel `vereint.theme`).

## 📱 App-Icons (`webservice/public`)

- `vereint-app-icon.svg`: Favicon und App-Icon, gefüllte Fläche im Markenverlauf mit weißer Bildmarke (bleibt bei 16 px lesbar).
- `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`, `icons/apple-touch-icon.png`: Homescreen-Icons, eingebunden über `manifest.webmanifest` und `index.html`.
