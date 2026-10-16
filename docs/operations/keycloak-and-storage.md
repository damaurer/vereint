# Betriebshandbuch: Keycloak IAM & S3-Objektspeicher

Dieses Dokument beschreibt die Konfiguration des Identity Providers **Keycloak 26.8.1** und des Objektspeichers (**AWS S3** in Produktion, **MinIO** lokal). Den Produktionsbetrieb beschreibt [deploy/README.md](../../deploy/README.md).

---

## 🔐 Keycloak OIDC Realm Konfiguration

Keycloak ist der zentrale Identity & Access Provider (OIDC). Das Realm `vereint` wird beim ersten Start des Containers importiert; einen bestehenden Realm überschreibt der Import nicht.

### 1. Realm-Import & Speicherorte
- **Entwicklungs-Export**: `keycloak/dev/realm-export-dev.json` (wird in `/opt/keycloak/data/import` gemountet), mit Seed-Benutzern und erlaubter Registrierungsseite.
- **Produktions-Export**: `keycloak/realm-export.json`, ohne Seed-Benutzer und ohne offene Registrierung; im Produktions-Image eingebaut.
- **Admin-Konsole lokal**: `http://localhost:8082/admin` (Zugang aus `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` der `.env`).
- **Admin-Konsole in Produktion**: von außen gesperrt, nur per SSM-Tunnel, siehe [deploy/README.md](../../deploy/README.md#keycloak-verwaltung).

### 2. OIDC Clients
| Client ID | Flow | Zweck |
| :--- | :--- | :--- |
| `vereint-web` | Standard Flow mit **PKCE (S256)**, vertraulich | Login über den BFF (lokal `http://localhost:4200/api/auth/callback`) |
| `vereint-service` | Service-Account | Zugriffe des Fachservice |
| `vereint-tablet` | Service-Account | Thekenterminal (Rolle `tabletRecorder`) |
| `vereint-registration` | Service-Account, nur `realm-management/manage-users` | Kontoanlage über [Einladungslinks](../domains/member-invites.md) |

Die Secrets kommen beim Import aus Umgebungsvariablen (`keycloak/README.md`); in Produktion erzeugt Terraform sie im SSM Parameter Store.

### 3. Seed-Benutzer (nur Entwicklungs-Realm)

| Benutzername | Rollen | Passwort |
| :--- | :--- | :--- |
| `admin` | `admin`, `board`, `member` | `KEYCLOAK_SEED_ADMIN_PASSWORD` aus der `.env`, temporär |
| `board` | `board`, `treasurer`, `member` | `KEYCLOAK_SEED_BOARD_PASSWORD`, temporär |
| `member` | `member` | `KEYCLOAK_SEED_MEMBER_PASSWORD`, temporär |

Im Produktions-Realm gibt es keine Benutzer; der erste Administrator wird nach dem ersten Deployment von Hand angelegt.

### 4. Sicherheitseinstellungen
- Passwortregeln: 10 bis 128 Zeichen, nicht gleich Benutzername oder E-Mail, nicht eines der letzten drei.
- Brute-Force-Schutz: nach 5 Fehlversuchen wachsende Sperre.
- Keine Direct Access Grants, keine Wildcard-Redirects, Refresh-Token-Rotation.
- Login- und Admin-Ereignisse werden 90 Tage gespeichert.
- Zwei-Faktor-Anmeldung ist freiwillig: Im Profil der App führt „Zwei-Faktor-Anmeldung einrichten“ zur Keycloak-Kontoverwaltung, wo eine Authenticator-App hinterlegt wird.

### 5. Login-Theme `vereint`
- **Speicherort**: `keycloak/themes/vereint/login`, Basis `keycloak.v2` (PatternFly 5).
- **Aktivierung**: Beide Realm-Exports setzen `loginTheme: "vereint"`, `defaultLocale: "de"` und `supportedLocales: ["de", "en"]`.
- **Gestaltete Seiten**: Login, Passwort zurücksetzen und Registrierung. Alle weiteren Keycloak-Seiten (z. B. OTP) erben Rahmen und Branding.
- **Dev-Cache**: `docker-compose.yml` schaltet den Theme-Cache ab, damit Änderungen sofort sichtbar sind. In Produktion bleibt der Cache aktiv. Details in `keycloak/README.md`.

---

## 🪣 S3-Objektspeicher

Bilder sowie Fotos und Videos aus Moments liegen im Objektspeicher; in der Datenbank stehen nur die Metadaten (`image_assets`, Moment-Medien).

| Umgebung | Speicher |
| :--- | :--- |
| Produktion | Privater AWS-S3-Bucket `vereint-app-<account>`, von Terraform angelegt, serverseitig verschlüsselt, nur per TLS erreichbar |
| Lokal | MinIO aus `docker-compose.yml`: API `http://localhost:9000`, Console `http://localhost:9001` (Zugang aus `S3_ACCESS_KEY` / `S3_SECRET_KEY` der `.env`), Bucket `vereint` |
| E2E-Tests | S3-Ersatz im Test-Stack |

### Speicher-Schlüssel
```text
{purpose}/{ziel_uuid}/{datei_uuid}.{png|jpg|gif}   # purpose: profile, event, drink, moment
moment/{moment_uuid}/{datei_uuid}.bin              # Fotos und Videos aus Moments
```

### Sicherheit
- Jede Datei wird vor dem Hochladen mit `DATA_ENCRYPTION_KEY` (AES-256-GCM) verschlüsselt; Moment-Medien in 64-KiB-Blöcken, damit auch Videos gestreamt statt ganz im Speicher gehalten werden.
- Bilder werden vor dem Verschlüsseln von EXIF/XMP-Metadaten (z. B. GPS) befreit, Videos von Orts- und Geräteangaben.
- Der Browser lädt Dateien nie direkt aus S3, sondern nur über berechtigungsgeprüfte Endpunkte des baseservice (`/api/v1/images/{id}/content`, `/api/v1/events/{eventId}/moments/{momentId}/media/{mediaId}/content` mit HTTP-Range für Videos).
- Nur der baseservice spricht mit S3 (`S3ObjectStorage.kt`); er signiert seine Anfragen selbst (SigV4, `S3_URL_TTL_SECONDS`) und gibt keine Links an Clients heraus.
