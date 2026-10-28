# Mitmachen

Schön, dass du an Vereint mitarbeiten willst. Vereint ist ein Hobbyprojekt;
Pull Requests, Fehlerberichte und Ideen sind willkommen.

## Ablauf

1. Für größere Änderungen zuerst ein Issue öffnen, damit wir das Vorgehen
   abstimmen können.
2. Vom Branch `develop` abzweigen und den Pull Request auch nach `develop`
   stellen. `qs` und `main` sind Auslieferungs-Branches
   ([Branches und CI](docs/betrieb/branches-und-ci.md)).
3. Lokal testen: `node local/vereint.mjs test` führt Backend-, Frontend- und
   E2E-Tests aus ([local/README.md](local/README.md)).
4. Ändert sich eine Funktion oder der Betrieb, die passende Datei unter `docs/`
   im selben Pull Request anpassen.

## Regeln

- Texte in der Oberfläche gibt es auf Deutsch und Englisch (i18n); neutral
  formulieren („Gruppe“, „Treffen“), Vereint ist für Gruppen aller Art.
- Neue Tabellen mit Gruppendaten brauchen `stammtisch_id`, eine RLS-Policy und
  `StammtischScoped` ([docs/domains/stammtische.md](docs/domains/stammtische.md)).
- Keine Secrets einchecken. Jeder Pull Request läuft durch Gitleaks.
- Sicherheitslücken bitte vertraulich melden, siehe [SECURITY.md](SECURITY.md).

## Lizenz

Mit einem Beitrag stimmst du zu, dass er unter der
[GNU Affero General Public License v3.0](LICENSE) veröffentlicht wird.
