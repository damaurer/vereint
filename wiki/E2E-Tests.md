# E2E-Tests

Playwright-Tests gegen den echten Produktions-Stack (`deploy/compose.yaml`) mit
Keycloak, baseservice, webservice, PostgreSQL, einem S3-Ersatz und Caddy mit
einer eigenen Test-CA. Die App läuft dabei wie in Produktion unter HTTPS, unter
`https://vereint.test:8443`.

In GitHub Actions laufen die Tests bei jedem Pull Request und Push auf `develop`,
`qs` und `main`.

## Lokal ausführen

```bash
echo "127.0.0.1 vereint.test" | sudo tee -a /etc/hosts   # einmalig
cd e2e
npm ci
npx playwright install chromium                          # einmalig
./stack.sh up            # Images bauen und Stack starten
npx playwright test      # alle Tests, --ui für den interaktiven Modus
./stack.sh down          # Stack samt Daten entfernen
```

`stack.sh up` erzeugt jedes Mal neue Wegwerf-Secrets und eine neue Test-CA. Die
Testkonten (Mitglied, zweites Mitglied, Vorstand, Admin, Terminal) legt das
Global Setup über die Keycloak-Admin-API mit Zufallspasswörtern an.

## Was abgedeckt ist

Ein Spec je Bereich: Anmeldung, Rollen, Sicherheit, Seiten, Events und Zusagen,
Guthaben und Theke, Chat und Direktnachrichten, Mitteilungen und Katalog, Bilder,
Mobilansicht. Die Tests prüfen auch direkt in Datenbank und Objektspeicher, dass
Nachrichten und Bilder verschlüsselt abgelegt sind.

## Beim Ändern der Oberfläche beachten

- Tests melden sich je Test frisch über die Keycloak-Maske an.
- Tests suchen Elemente teils über sichtbare Texte. Wer Texte in `de.json`
  ändert, passt die Selektoren in `e2e/tests` mit an.
- Die Datenbank bleibt zwischen Läufen bestehen; Tests nutzen eindeutige Namen
  und rechnen mit relativen Guthaben.

Mehr: [e2e/README.md](https://github.com/damaurer/vereint/blob/develop/e2e/README.md)
