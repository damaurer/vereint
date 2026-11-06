# Design-Entwurf: alle Bildschirme

Dieser Ordner enthält den Design-Entwurf von Vereint: jeden Bildschirm der App als eigene Datei, mit Beispieldaten aus der Gruppe „Meine Gruppe“ (Stammtisch Oktober). Gerenderte Bilder und eine ausführliche Beschreibung jedes Bildschirms stehen im Handbuch unter [Die App Bildschirm für Bildschirm](../../handbuch/07-alle-screens.md); die Bilder liegen in [`docs/handbuch/screens`](../../handbuch/screens).

## Inhalt

| Pfad | Inhalt |
| :--- | :--- |
| `*.dc.html` | Ein Bildschirm je Datei (Design-Component-Format des Design-Canvas). Markup mit `{{…}}`-Platzhaltern, die Logik steht im `<script type="text/x-dc">` am Ende. |
| `TopBar`, `TabBar`, `Sidebar` | Wiederverwendete Bausteine (Kopfzeile, untere Leiste, Seitenleiste), per `<dc-import>` eingebunden. |
| `canvas.json` | Anordnung der Bildschirme auf dem Canvas: Seiten (Einstieg & Konto, Mitglied, Vorstand, Theke, Administration, Bausteine), Position, Größe und Überschriften. |
| `ds/vereint/tokens.css` | Design-Tokens (Farben hell/dunkel, Abstände, Radien, Schrift), erzeugt aus dem Design System. |
| `ds/vereint/components/bundle.css` | Komponentenklassen, übernommen aus `webservice/src/styles.css`. |
| `logo.svg` | Vereint-Logo. Im Canvas liegt es als Asset unter `/_blob/658eacfb311db734fae6de78ff566261`. |

## Größen

| Bereich | Größe |
| :--- | :--- |
| Handy (Mitglied, Vorstand, Einstieg) | 390 × 844 |
| Thekenterminal (Tablet quer) | 1180 × 820 |
| Administration, Statistik-Übersicht (Rechner) | 1440 breit, fließend |

## Entwurf und App

Der Entwurf ist das Zielbild. Die meisten Bildschirme entsprechen der heutigen App, einige zeigen geplante Funktionen:

- **Strichliste nach Kategorien** (`Theke`, `StrichRueckgaengig`, `StrichKategorien`, Feld „Strich-Kategorie“ in `GetraenkBearbeiten`): Der Vorstand legt Kategorien als Spalten fest, ihr Preis überschreibt den Getränkepreis.
- **Runden nur am eigenen Handy** (`RundeHandy`, Knopf „Runde ausgeben“ in `Event`): Bezahlt wird vom eigenen Guthaben; das Terminal zeigt Runden nur an (`RundeAusgeben`).
- **Statistiken für alle Mitglieder** (`Statistik`, `Getraenkestatistik`, `StatistikUebersicht`): Getränke, Kalorien, Zusagen, Absagen, Trinkverhalten, Rekorde.

Tarife gibt es nicht mehr; der Entwurf enthält keine.

## Ansehen und ändern

Die Dateien brauchen die Laufzeit des Design-Canvas (`support.js`), die nicht im Repository liegt. Bearbeitet wird der Entwurf im Design-Canvas-Artifact; danach die geänderten Dateien hierher kopieren und die Bilder in `docs/handbuch/screens` neu rendern (Playwright, Gerätefaktor 2, je Bildschirm die Größe aus `canvas.json`).
