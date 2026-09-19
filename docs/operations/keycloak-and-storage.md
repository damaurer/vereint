# Betriebshandbuch: Keycloak IAM & S3-Objektspeicher

Dieses Dokument beschreibt die Konfiguration und Verwaltung des Identity Providers **Keycloak 26** sowie des **MinIO S3-kompatiblen Objektspeichers**.

---

## 🔐 Keycloak 26 OIDC Realm Konfiguration

Keycloak dient als zentraler Identity & Access Provider (OIDC). Für die lokale Entwicklung wird das Realm `vereint` automatisch beim Start des Containers importiert.

### 1. Realm-Import & Speicherorte
- **Entwicklungs-Export**: `keycloak/dev/realm-export-dev.json` (wird in `/opt/keycloak/data/import` gemountet).
- **Produktions-Export**: `keycloak/realm-export.json`.
- **Admin-Konsole**: `http://localhost:8082/admin` (Login: `admin` / `admin`).

### 2. OIDC Clients
| Client ID | Protokoll | Flow | Redirect URIs | Zweck |
| :--- | :--- | :--- | :--- | :--- |
| `vereint-web` | OpenID Connect | Standard Flow mit **PKCE (S256)** | `http://localhost:4000/auth/callback` | Web-BFF (Express / Angular) |
| `vereint-backend` | OpenID Connect | Bearer-Only / Resource Server | N/A | Spring Boot JWT-Validierung |

### 3. Vorkonfigurierte Seed-Benutzer

| Benutzername | Passwort | Zugewiesene Rollen | Zweck |
| :--- | :--- | :--- | :--- |
| `admin` | `admin` | `admin`, `board`, `member` | Vollständige Vereins- und Systemadministration |
| `board` | `board` | `board`, `member` | Vorstandsmitglied (Events, Kassenbuch, Chat) |
| `member` | `member` | `member` | Normales Vereinsmitglied (Profil, Kasse, RSVPs) |
| `tablet` | `tablet` | `member`, `tabletRecorder` | Kiosk-Tablet an der Vereinstheke |

### 4. Login-Theme `vereint`
- **Speicherort**: `keycloak/themes/vereint/login` (wird in `/opt/keycloak/themes` gemountet), Basis `keycloak.v2` (PatternFly 5).
- **Aktivierung**: Beide Realm-Exports setzen `loginTheme: "vereint"`, `defaultLocale: "de"` und `supportedLocales: ["de", "en"]`; nach `docker compose up` ist das Theme ohne manuelle Konfiguration aktiv.
- **Gestaltete Seiten**: Login, Passwort zurücksetzen und Registrierung (Registrierung nur im Entwicklungs-Realm aktiviert). Alle weiteren Keycloak-Seiten erben Rahmen und Branding.
- **Design**: Split-Screen mit Vereint-Verlauf und Logo, Optimus-Design-Tokens, responsiv ab 320 px, automatischer Dark-Mode über `prefers-color-scheme`.
- **Dev-Cache**: `KC_SPI_THEME_CACHE_THEMES=false`, `KC_SPI_THEME_CACHE_TEMPLATES=false`, `KC_SPI_THEME_STATIC_MAX_AGE=-1` in `docker-compose.yml` – Änderungen sind sofort sichtbar. In Produktion diese Variablen nicht setzen (Cache bleibt aktiv). Details in `keycloak/README.md`.

---

## 🪣 MinIO / S3 Objektspeicher

Bilder (Profilbilder, Event-Banner, Getränkefotos) werden in S3-kompatiblen Buckets gespeichert. In der Datenbank verbleiben lediglich die Metadaten (`image_assets`).

### 1. Bucket & Zugangsdaten
- **S3 API Endpunkt**: `http://localhost:9000`
- **MinIO Web Console**: `http://localhost:9001` (Login: `vereint-minio-admin` / `change-me-minio-secret`)
- **Bucket-Name**: `vereint`

### 2. Speicher-Schlüsselstruktur (Storage Keys)
Dateien werden nach Zweck strukturiert abgelegt:
```text
images/profile/{user_uuid}/{image_uuid}.webp
images/event/{event_uuid}/{image_uuid}.webp
images/drink/{drink_uuid}/{image_uuid}.webp
images/moment/{session_uuid}/{image_uuid}.webp
```

### 3. Presigned URLs & Sicherheit
- Bilder werden nicht öffentlich freigegeben, sondern über kurzlebige **Presigned URLs** (`S3_URL_TTL_SECONDS: 900`, 15 Minuten) für autorisierte Clients gestreamt.
- Der direkte Zugriff auf den S3-Speicher erfolgt ausschließlich serverintern über `baseservice` (`S3ObjectStorage.kt`).
