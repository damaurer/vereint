# E2E-Tests

Playwright-Tests gegen den kompletten Stack: `local/compose.yaml` mit den
Anpassungen aus `compose.e2e.yaml` (Keycloak, baseservice, webservice,
Postgres, Bilder und Videos im Dateispeicher wie in Produktion und
Caddy mit einer eigenen Test-CA). Die App
läuft dabei wie in Produktion unter HTTPS, hier unter `https://vereint.test:8443`.

In GitHub Actions laufen die Tests bei jedem Pull Request und Push auf
`develop`, `qs` und `main` (`.github/workflows/e2e.yml`).

## Lokal ausführen

Voraussetzungen: Docker mit Compose, Node.js 22, OpenSSL.

```bash
echo "127.0.0.1 vereint.test" | sudo tee -a /etc/hosts   # einmalig
cd e2e
npm ci
npx playwright install chromium                          # einmalig
./stack.sh up            # Images bauen, Stack starten (E2E_SKIP_BUILD=1 nutzt vorhandene)
npx playwright test      # alle Tests; --ui für den interaktiven Modus
./stack.sh down          # Stack samt Daten entfernen
```

`stack.sh up` erzeugt bei jedem Start neue Wegwerf-Secrets (`.env.e2e`) und eine
neue Test-CA (`.ca/`). Die Testkonten legt `support/global-setup.ts` über die
Keycloak-Admin-API an, mit zufälligen Passwörtern in `.auth/users.json`.

## Aufbau

- `tests/` – ein Spec je Fachbereich (Anmeldung, Rollen, Sicherheit, Seiten,
  Events, Guthaben/Theke, Mitteilungen/Katalog, Bilder, Mobil).
- `support/fixtures.ts` – `as('member' | 'board' | 'admin' | 'terminal' | 'member2')`
  meldet ein Konto über die echte Keycloak-Maske an und liefert Seite und API-Client.
  Testkonten stimmen nach dem Login der gültigen AGB-Fassung zu
  (`support/login.ts`); die AGB-Sperre selbst prüft `tests/auth.spec.ts`.
- `support/api.ts` – legt Testdaten über die API an, wo es keine Oberfläche gibt
  (z. B. Events anlegen).
- `support/stack.ts` – Blick in Datenbank und Objektspeicher, um die
  Verschlüsselung zu prüfen.

Die Datenbank bleibt zwischen zwei Läufen bestehen, solange der Stack läuft.
Tests erzeugen deshalb eindeutige Namen (`unique()`) und rechnen mit relativen
Guthaben.
