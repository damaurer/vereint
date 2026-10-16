# Lokale Entwicklung

## Voraussetzungen

- Docker mit Docker Compose
- Java 25 (JDK) für den baseservice
- Node.js 22 (mindestens 22.22.3, das verlangt die Angular-CLI) und npm 11

## Starten

```bash
# 1. Umgebungsvariablen anlegen und Werte prüfen
cp .env.example .env

# 2. PostgreSQL (2x), Keycloak und MinIO starten
docker compose up -d

# 3. Fachservice (Port 8081; Swagger UI unter /swagger-ui.html nur mit API_DOCS_ENABLED=true)
cd baseservice
./gradlew bootRun

# 4. Oberfläche mit SSR und BFF (Port 4200)
cd webservice
npm install
npm start
```

Danach ist die App unter `http://localhost:4200` erreichbar. Der lokale
Keycloak-Client erlaubt Weiterleitungen nur auf Port 4200; `PUBLIC_BASE_URL` in
der `.env` muss deshalb auf `http://localhost:4200` zeigen.

Lokal ersetzt **MinIO** den AWS-S3-Speicher, und Keycloak importiert den
Entwicklungs-Realm aus `keycloak/dev/realm-export-dev.json`.

## Testkonten

Der Entwicklungs-Realm legt diese Konten an. Die Passwörter kommen aus der
`.env` (`KEYCLOAK_SEED_*_PASSWORD`) und müssen beim ersten Login geändert
werden.

| Benutzer | Rollen |
| :--- | :--- |
| `admin` | `admin`, `board`, `member` |
| `board` | `board`, `treasurer`, `member` |
| `member` | `member` |

Das Thekenterminal nutzt den Service-Account des Clients `vereint-tablet`.

## Tests

| Was | Befehl |
| :--- | :--- |
| baseservice | `cd baseservice && ./gradlew test` |
| webservice | `cd webservice && npm test` |
| E2E | siehe [E2E-Tests](E2E-Tests) |
| Terraform | `cd infra/aws && terraform fmt -check -recursive && terraform validate` |

## Hinweise

- Verschlüsselung (`DATA_ENCRYPTION_ENABLED`) und Web Push (`VAPID_ENABLED`) sind
  lokal standardmäßig aus.
- Die Barcode-Kamera braucht HTTPS. Lokal geht deshalb nur die Eingabe des
  Codes; mit Kamera testen lässt sich im [E2E-Stack](E2E-Tests) oder nach dem
  Deployment.
- Änderungen am Keycloak-Login-Theme sind lokal nach einem Reload sichtbar
  ([keycloak/README.md](https://github.com/damaurer/vereint/blob/develop/keycloak/README.md)).

Mehr: [docs/operations/local-setup-docker.md](https://github.com/damaurer/vereint/blob/develop/docs/operations/local-setup-docker.md),
[docs/baseservice/01-overview-and-setup.md](https://github.com/damaurer/vereint/blob/develop/docs/baseservice/01-overview-and-setup.md),
[docs/backend-for-frontend/01-overview-and-setup.md](https://github.com/damaurer/vereint/blob/develop/docs/backend-for-frontend/01-overview-and-setup.md)
