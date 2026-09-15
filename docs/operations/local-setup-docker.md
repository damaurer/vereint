# Betriebshandbuch: Lokales Setup & Docker Compose

Dieses Handbuch beschreibt die Einrichtung und den Betrieb der lokalen Entwicklungsumgebung für das **Vereint**-Projekt.

---

## 🛠️ Voraussetzungen
- **Docker & Docker Compose** (Docker Desktop oder Docker Engine ab Version 24+)
- **Java JDK 21** (Temurin, Corretto oder OpenJDK)
- **Node.js 22 LTS & npm**

---

## 🐳 Docker Compose Topologie (`docker-compose.yml`)

Die Datei `docker-compose.yml` startet die vollständige Infrastruktur für die lokale Entwicklung:

```yaml
services:
  keycloak-db:      # PostgreSQL 17.6 Alpine auf Port 5433 (Keycloak Realm DB)
  vereint-db:       # PostgreSQL 17.6 Alpine auf Port 5432 (Hauptanwendung)
  keycloak:         # Keycloak 26 Dev Mode auf Port 8082 (Importiert ./keycloak/dev)
  object-storage:   # MinIO S3 Objektspeicher auf Port 9000 (API) & 9001 (Console)
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
*Backend ist erreichbar unter `http://localhost:8080` (bzw. Port 8081 je nach Konfiguration).*

### 2. Frontend & SSR-BFF (`webservice`)
```bash
cd webservice
npm install
npm run dev:ssr
```
*Frontend & BFF laufen auf `http://localhost:4000`.*
