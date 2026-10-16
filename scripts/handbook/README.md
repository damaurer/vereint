# Handbuch-Screenshots

`capture.mjs` erzeugt alle Bilder in `docs/handbuch/bilder` neu. Es legt in einer
frischen lokalen Umgebung Demo-Daten an (`seed.mjs`: Mitglieder, Getränke,
Events mit Zusagen, Guthaben, Striche, Gruppen-, Event- und Direktchats, Moments,
Rundbrief und Infotafel, eine Gasteinladung, Einträge in der Getränkedatenbank) und
fotografiert jede Ansicht als die Person, die sie im Alltag nutzt: Handy
(390 × 844), Thekentablet quer (1180 × 820) oder Rechner (1280 × 860).

Nur lokal verwenden: Das Skript ändert Benutzer im Keycloak-Entwicklungsrealm.

## Ablauf

1. Lokale Umgebung mit **leeren** Datenbanken starten (der Seed legt bei jedem
   Lauf neue Daten an):

   ```bash
   docker compose down -v            # löscht nur die lokalen Entwicklungsdaten
   docker compose up -d --wait keycloak-db vereint-db keycloak
   ```

2. Fachservice starten (`baseservice`, Port 8081) und den Webservice als
   Produktions-Build auf Port 4200 starten, damit die Keycloak-Weiterleitung
   des Entwicklungsrealms passt:

   ```bash
   cd webservice && npx ng build
   PORT=4200 PUBLIC_BASE_URL=http://localhost:4200 node dist/webservice/server/server.mjs
   ```

   `PORT` und `PUBLIC_BASE_URL` müssen dafür auch in `.env` auf 4200 stehen.

3. Bilder aufnehmen:

   ```bash
   cd scripts/handbook
   npm install
   set -a && . ../../.env && set +a   # Keycloak-Admin und Seed-Passwörter
   npm run capture                    # alle Bilder
   node capture.mjs t-runde m-guthaben  # nur einzelne Bilder (legt neue Demo-Daten an)
   node capture.mjs --reuse m-chat      # einzelne Bilder mit den Daten des letzten Laufs
   ```

Neue Bilder ergänzt man als Eintrag in `SHOTS` in `capture.mjs`.

Die Kiosk-Bilder (`t-kiosk-start`, `t-kiosk-entsperren`, `v-kiosk-geraete`) stehen am Ende
von `SHOTS`, weil das Demo-Terminal danach im Kiosk-Modus bleibt. Wer sie einzeln
mit `--reuse` aufnimmt, setzt die Umgebung danach am besten neu auf.
