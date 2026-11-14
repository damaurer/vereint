# Vereint lokal ausführen und testen

Ein Befehl startet die komplette App auf dem eigenen Rechner, mit Demo-Daten.
Ein zweiter Befehl führt alle Tests aus: Backend, Frontend und E2E.

Es laufen dieselben Images wie in Produktion ([`compose.yaml`](compose.yaml):
Caddy, Keycloak mit dem Produktionsrealm, baseservice, webservice, PostgreSQL,
Bilder und Videos verschlüsselt im Dateispeicher), nur unter
`http://localhost:4200` statt HTTPS. Die lokalen Abweichungen stehen in
[`compose.local.yaml`](compose.local.yaml).

Wer den Stack schon vor dem Umstieg auf den Dateispeicher genutzt hat
(November 2026), startet einmal mit `node local/vereint.mjs down --clean` und
`up` neu, sonst fehlen die Bilder der Demo-Daten.

Dasselbe gilt nach dem Umstieg auf **PostgreSQL 18** (November 2026): Ein
Daten-Volume von PostgreSQL 17 startet mit dem neuen Image nicht. Lokal
einmal `node local/vereint.mjs down --clean` (beim Root-`docker-compose.yml`:
`docker compose down -v`) und neu starten. Wer eine echte Datenbank betreibt,
migriert sie vor dem Wechsel der Hauptversion (`pg_upgrade` oder Dump und
Restore).

## Voraussetzungen

| Für | Braucht |
|---|---|
| App starten, Backend- und Frontend-Tests | Docker Desktop (oder Docker Engine mit Compose) und Node.js 22 |
| zusätzlich E2E-Tests | Bash und OpenSSL, einmalig ein Eintrag für `vereint.test` (siehe unten) |

Java, Gradle und die npm-Pakete des Frontends müssen nicht installiert sein; sie
laufen in Containern. Docker Desktop sollte mindestens 4 GB Arbeitsspeicher haben.

Unter Windows funktionieren `up`, `down` und die Backend- und Frontend-Tests
in PowerShell. Die E2E-Tests startet man in Git Bash oder WSL, weil sie
`e2e/stack.sh` nutzen.

## App starten

```bash
node local/vereint.mjs up
```

Der erste Start baut die drei Images und dauert einige Minuten, spätere Starts
gehen schneller. Danach läuft die App unter **http://localhost:4200** mit einem
typischen Vereinsabend: Mitglieder, Getränke und Speisen, Events mit Zusagen,
Guthaben, Striche, Chats, Moments, Rundbrief und Infotafel.

| Konto | Passwort | Rolle |
|---|---|---|
| `admin` | `admin-demo-2026` | Administration, Vorstand, Mitglied |
| `board` | `board-demo-2026` | Vorstand und Kasse |
| `member` | `member-demo-2026` | Mitglied |
| `jonas`, `mia`, `felix` | `<name>-demo-2026` | weitere Mitglieder; `jonas` und `felix` sind zusätzlich im „Kegelclub Alle Neune“ und wählen nach der Anmeldung ihre Gruppe |
| `theke` | `theke-demo-2026` | Thekentablet |

Die Konten gibt es nur in diesem lokalen Stack. Chrome, Edge oder Firefox
nehmen; Safari speichert das Anmelde-Cookie unter `http://localhost` nicht.

Weitere Befehle:

```bash
node local/vereint.mjs logs              # Logs aller Dienste, z. B. `logs baseservice`
node local/vereint.mjs down              # stoppen, Daten bleiben erhalten
node local/vereint.mjs down --clean      # alles löschen, der nächste `up` startet frisch
node local/vereint.mjs seed              # Demo-Daten anlegen, falls noch keine da sind
```

Nach Codeänderungen baut `up` die betroffenen Images neu und startet sie; die
Daten bleiben dabei erhalten.

| Was | Wo |
|---|---|
| App | http://localhost:4200 |
| Keycloak-Admin-Konsole | http://localhost:8090/kc/admin (Benutzer `admin`, Passwort gibt `up` aus) |
| PostgreSQL | `localhost:5434`, Benutzer `postgres` |

Die Passwörter für Datenbank, Keycloak-Admin und die übrigen Secrets erzeugt
`up` beim ersten Start zufällig und legt sie in `local/.env.local` ab (nicht
versioniert). E-Mail-Versand und Web-Push sind lokal aus.

## Alle Tests ausführen

```bash
node local/vereint.mjs test              # backend, frontend und e2e nacheinander
node local/vereint.mjs test backend      # nur ein Teil; mehrere gehen auch: test backend frontend
```

| Teil | Was läuft | Wie in CI |
|---|---|---|
| `backend` | `./gradlew test` im baseservice (JDK 25 im Container); die PostgreSQL-Integrationstests starten über Testcontainers einen eigenen Datenbank-Container | `baseservice-docker.yml` |
| `frontend` | `npm test` im webservice (Vitest) | `webservice-docker.yml` |
| `e2e` | Playwright gegen den Produktions-Stack unter `https://vereint.test:8443` (`e2e/stack.sh`, eigener Stack mit Wegwerfdaten, danach wieder entfernt) | `e2e.yml` |

Am Ende steht je Teil OK oder FEHLER. Berichte liegen unter
`local/test-results/` (Backend: `backend/index.html`; E2E: Traces und Videos
fehlgeschlagener Tests und bei Fehlern `e2e/stack-logs.txt`).

Für die E2E-Tests einmalig die Testdomain auf den eigenen Rechner zeigen lassen:

```bash
echo "127.0.0.1 vereint.test" | sudo tee -a /etc/hosts      # Linux, macOS
```

Unter Windows die Zeile `127.0.0.1 vereint.test` als Administrator in
`C:\Windows\System32\drivers\etc\hosts` eintragen.

Der lokale App-Stack und der E2E-Stack nutzen verschiedene Ports und können
gleichzeitig laufen.

## Entwickeln mit automatischem Neuladen

`up` startet fertige Images. Wer am Code arbeitet und Änderungen sofort sehen
will, startet Keycloak und die Datenbanken mit `docker compose up -d` und den
baseservice und webservice direkt auf dem Rechner (siehe
[Lokale Entwicklung im README](../README.md#-lokale-entwicklung)). Das braucht
Java 25 und Node.js 22 auf dem Rechner.

## Wenn etwas hakt

- **Port belegt**: Der Stack braucht 4200, 8090 und 5434. Läuft zum Beispiel
  `ng serve` auf 4200, diesen zuerst beenden.
- **Demo-Daten unvollständig**: Bricht das Anlegen ab, setzt
  `node local/vereint.mjs down --clean` alles zurück; danach wieder `up`.
- **Ein Dienst startet nicht**: `node local/vereint.mjs logs <dienst>` zeigt
  den Grund (`keycloak`, `baseservice`, `webservice`, `caddy`, `postgres`).
