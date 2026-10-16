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
  keycloak:         # Keycloak 26.8.1 Dev Mode auf Port 8082 (importiert ./keycloak/dev)
  object-storage:   # MinIO als lokaler S3-Ersatz auf Port 9000 (API) & 9001 (Console); Produktion nutzt AWS S3
```

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

| Variable | Beschreibung | Standard / Entwicklung |
| :--- | :--- | :--- |
| `VEREINT_DB_PORT` | Host-Port der Vereinsdatenbank | `5432` |
| `VEREINT_DB_USERNAME` | PostgreSQL Benutzername | `vereint` |
| `VEREINT_DB_PASSWORD` | PostgreSQL Passwort | `change-me-vereint-db-password` |
| `KEYCLOAK_DB_PORT` | Host-Port der Keycloak-Datenbank | `5433` |
| `KEYCLOAK_PORT` | Host-Port der Keycloak Web-Oberfläche | `8082` |
| `KEYCLOAK_ADMIN` | Admin-Benutzername für Keycloak | `admin` |
| `KEYCLOAK_ADMIN_PASSWORD` | Admin-Passwort für Keycloak | `admin` |
| `S3_ACCESS_KEY` | MinIO S3 Access Key | `vereint-minio-admin` |
| `S3_SECRET_KEY` | MinIO S3 Secret Key | `change-me-minio-secret` |

---

## 🚀 Anwendungsstart (Schritt-für-Schritt)

### 1. Backend (`baseservice`)
```bash
cd baseservice
./gradlew bootRun
```
*Backend ist erreichbar unter `http://localhost:8081`. Swagger UI nur mit `API_DOCS_ENABLED=true`.*

### 2. Frontend & SSR-BFF (`webservice`)
```bash
cd webservice
npm install
npm start
```
*Frontend, SSR und BFF laufen auf `http://localhost:4200`. `PUBLIC_BASE_URL` in der `.env` muss auf `http://localhost:4200` zeigen, weil der Entwicklungs-Realm nur dorthin weiterleitet.*
