# Betriebshandbuch: Lokales Setup & Docker Compose

Dieses Handbuch beschreibt die Einrichtung und den Betrieb der lokalen Entwicklungsumgebung für das **Vereint**-Projekt.

---

## 🛠️ Voraussetzungen
- **Docker & Docker Compose** (Docker Desktop oder Docker Engine ab Version 24+)
- **Java JDK 25** (Temurin, Corretto oder OpenJDK)
- **Node.js ≥ 22.22.3 & npm 11+** (die Angular-CLI verlangt mindestens 22.22.3)

---

## 🐳 Docker Compose Topologie (`docker-compose.yml`)

Die Datei `docker-compose.yml` startet die vollständige Infrastruktur für die lokale Entwicklung:

```yaml
services:
  keycloak-db:      # PostgreSQL 17.6 Alpine auf Port 5433 (Keycloak Realm DB)
  vereint-db:       # PostgreSQL 17.6 Alpine auf Port 5432 (Hauptanwendung)
  keycloak:         # Keycloak 26.8.1 Dev Mode auf Port 8082 (importiert ./keycloak/dev, bindet ./keycloak/themes ein)
  object-storage:   # S3Mock als lokaler S3-Ersatz auf Port 9090, legt den Bucket selbst an; Produktion auf Strato nutzt ein Verzeichnis
```

Fachservice und Oberfläche laufen lokal nicht in Compose, sondern direkt (siehe unten).

### Befehle zum Starten und Stoppen
```bash
# Starten aller Container im Hintergrund
docker compose up -d

# Status und Healthchecks prüfen
docker compose ps

# Logs der Container einsehen
docker compose logs -f keycloak vereint-db

# Stoppen der Container (Daten bleiben in Volumes erhalten)
docker compose down

# Vollständiger Reset inklusive Löschung aller Datenbank-Volumes
docker compose down -v
```

---

## ⚙️ Umgebungsvariablen (.env Konfiguration)

`.env.example` nach `.env` kopieren (oder `npm run env:prepare` im `webservice/`). Die Vorlage enthält funktionierende Entwicklungswerte und passt ohne Änderungen zu `docker-compose.yml` und dem Entwicklungs-Realm. Ihre Passwörter und Secrets sind bekannte Werte, die nur für die lokalen Container gelten; Produktion bekommt eigene Werte aus dem Vault von LinuxServerSetup ([Strato](../betrieb/strato.md)). Wichtige Einträge:

| Variable | Beschreibung | Standard / Entwicklung |
| :--- | :--- | :--- |
| `PUBLIC_BASE_URL`, `PORT` | Adresse und Port der App; der Entwicklungs-Realm leitet nur nach `http://localhost:4200` zurück | `http://localhost:4200`, `4200` |
| `VEREINT_DB_PORT`, `VEREINT_DB_NAME`, `VEREINT_DB_USERNAME`, `VEREINT_DB_PASSWORD` | App-Datenbank | Port `5432`, Name und Benutzer `vereint` |
| `KEYCLOAK_DB_PORT`, `KEYCLOAK_DB_USERNAME`, `KEYCLOAK_DB_PASSWORD` | Keycloak-Datenbank | Port `5433` |
| `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD` | Zugang zur Keycloak-Admin-Konsole (`http://localhost:8082/admin`) | `admin` / `local-dev-keycloak-admin` |
| `KEYCLOAK_SEED_ADMIN_PASSWORD`, `KEYCLOAK_SEED_BOARD_PASSWORD`, `KEYCLOAK_SEED_MEMBER_PASSWORD` | Startpasswörter der Konten `admin`, `board`, `member` im Entwicklungs-Realm; beim ersten Login zu ändern | `admin-demo-2026`, `board-demo-2026`, `member-demo-2026` |
| `S3_ENABLED`, `S3_ENDPOINT` | Bilder und Videos im S3Mock-Container; mit `S3_ENABLED=false` im Arbeitsspeicher des Fachservice | `true`, `http://localhost:9090` |
| `API_DOCS_ENABLED` | Swagger UI unter `http://localhost:8081/swagger-ui.html` | `true` (Produktion `false`) |
| `TENANCY_BOOTSTRAP_REALM_ROLES` | Testkonten ohne Mitgliedschaft treten „Meine Gruppe“ bei, Realmrollen werden Gruppenrollen. Nur lokal und in E2E, in Produktion nie | `true` |
| `SIGNUP_ENABLED`, `SIGNUP_MAX_OWNED` | Eigene Gruppen eröffnen (`/gruppe-eroeffnen`) an/aus, Höchstzahl eigener Gruppen | `true`, `3` |

---

## 🚀 Anwendungsstart (Schritt-für-Schritt)

### 1. Backend (`baseservice`)
```bash
cd baseservice
./gradlew bootRun
```
*Backend ist erreichbar unter `http://localhost:8081`. Swagger UI nur mit `API_DOCS_ENABLED=true`.*

`./gradlew bootRun` übernimmt die Werte aus der `.env` im Repo-Wurzelverzeichnis; bereits exportierte Umgebungsvariablen haben Vorrang. Ohne `.env` gelten die Standardwerte aus `application.yaml`.

### 2. Frontend & SSR-BFF (`webservice`)
```bash
cd webservice
npm install
npm start
```
*Frontend, SSR und BFF laufen auf `http://localhost:4200`; die `.env` aus der Vorlage passt dazu.*
