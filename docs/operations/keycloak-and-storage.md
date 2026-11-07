# Betriebshandbuch: Keycloak IAM & S3-Objektspeicher

Dieses Dokument beschreibt die Konfiguration des Identity Providers **Keycloak 26.8.1** und des Dateispeichers (ein **Verzeichnis**, optional **S3**). Den Betrieb beschreibt [Vereint selbst betreiben](../betrieb/selbst-betreiben.md).

---

## 🔐 Keycloak OIDC Realm Konfiguration

Keycloak ist der zentrale Identity & Access Provider (OIDC). Das Realm `vereint` wird beim ersten Start des Containers importiert; einen bestehenden Realm überschreibt der Import nicht.

### 1. Realm-Import & Speicherorte
- **Entwicklungs-Export**: `keycloak/dev/realm-export-dev.json` (wird in `/opt/keycloak/data/import` gemountet), mit Seed-Benutzern, Registrierungsseite und „Passwort vergessen“.
- **Produktions-Export**: `keycloak/realm-export.json`, ohne Seed-Benutzer, ohne offene Registrierung und ohne „Passwort vergessen“ (`resetPasswordAllowed: false`); im Produktions-Image eingebaut. Neue Konten entstehen nur über die App (Einladungslink oder Gruppe eröffnen).
- **Admin-Konsole lokal**: `http://localhost:8082/admin` (Zugang aus `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` der `.env`).
- **Admin-Konsole in Produktion**: Sie darf von außen nicht erreichbar sein (lokal sperrt `local/Caddyfile` `/kc/admin`); den ersten Administrator beschreibt [Vereint selbst betreiben](../betrieb/selbst-betreiben.md#erster-start).

### 2. OIDC Clients
| Client ID | Flow | Zweck |
| :--- | :--- | :--- |
| `vereint-web` | Standard Flow mit **PKCE (S256)**, vertraulich | Login über den BFF (lokal `http://localhost:4200/api/auth/callback`) |
| `vereint-service` | Bearer-only, kein Login und kein Service-Account | Ressourcen-Client des Fachservice |
| `vereint-tablet` | Service-Account | Thekenterminal (Rolle `tabletRecorder`) |
| `vereint-registration` | Service-Account, nur `realm-management/manage-users` | Kontoanlage über [Einladungslinks](../domains/member-invites.md) und beim Eröffnen einer Gruppe |

Die Secrets kommen beim Import aus Umgebungsvariablen (`keycloak/README.md`); in Produktion setzt sie der Betreiber.

### 3. Seed-Benutzer (nur Entwicklungs-Realm)

| Benutzername | Realm-Rollen | Passwort |
| :--- | :--- | :--- |
| `admin` | `admin`, `board`, `member` | `KEYCLOAK_SEED_ADMIN_PASSWORD` aus der `.env`, temporär |
| `board` | `board`, `treasurer`, `member` | `KEYCLOAK_SEED_BOARD_PASSWORD`, temporär |
| `member` | `member` | `KEYCLOAK_SEED_MEMBER_PASSWORD`, temporär |

Rollen und Berechtigungen gelten in Vereint je Gruppe und liegen in der Datenbank, nicht in Keycloak. Die Realm-Rollen der Seed-Benutzer wirken nur, wenn `TENANCY_BOOTSTRAP_REALM_ROLES=true` gesetzt ist (lokal und in E2E-Tests): Dann tritt ein Konto ohne Mitgliedschaft beim ersten Aufruf der Standardgruppe mit den passenden Systemrollen bei. Die Realm-Rolle `admin` macht ein Konto außerdem zur Plattform-Administration (alle Gruppen, Getränkedatenbank).

Im Produktions-Realm gibt es außer den Service-Accounts keine Benutzer; die erste Plattform-Administration bekommt nach dem ersten Deployment von Hand die Realm-Rolle `admin`.

### 4. Sicherheitseinstellungen
- Passwortregeln: 10 bis 128 Zeichen, nicht gleich Benutzername oder E-Mail, nicht eines der letzten drei.
- Brute-Force-Schutz: nach 5 Fehlversuchen wachsende Sperre.
- Keine Direct Access Grants, keine Wildcard-Redirects, Refresh-Token-Rotation.
- Login- und Admin-Ereignisse werden 90 Tage gespeichert.
- Zwei-Faktor-Anmeldung ist freiwillig: Im Profil der App führt „Zwei-Faktor-Anmeldung einrichten“ zur Keycloak-Kontoverwaltung, wo eine Authenticator-App hinterlegt wird.

### 5. Login-Theme `vereint`
- **Speicherort**: `keycloak/themes/vereint/login`, Basis `keycloak.v2` (PatternFly 5).
- **Aktivierung**: Beide Realm-Exports setzen `loginTheme: "vereint"`, `defaultLocale: "de"` und `supportedLocales: ["de", "en"]`.
- **Gestaltete Seiten**: Login, Passwort zurücksetzen und Registrierung (die beiden letzten sind nur im Entwicklungs-Realm erreichbar). Alle weiteren Keycloak-Seiten (z. B. OTP) erben Rahmen und Branding.
- **Dev-Cache**: `docker-compose.yml` schaltet den Theme-Cache ab, damit Änderungen sofort sichtbar sind. In Produktion bleibt der Cache aktiv. Details in `keycloak/README.md`.

---

## 🪣 Dateispeicher

Bilder, Gruppenbilder sowie Fotos und Videos aus Moments liegen im Objektspeicher; in der Datenbank stehen nur die Metadaten (`image_assets`, `moment_media`, Schlüssel des Gruppenbilds an `stammtische`).

| Umgebung | Speicher |
| :--- | :--- |
| Produktion | Dauerhaftes Volume mit `STORAGE_BACKEND=filesystem`; die Dateien sind von der App verschlüsselt und gehören in die Backups |
| Lokaler Stack und E2E-Tests | Volume `files` in `local/compose.yaml`, ebenfalls `STORAGE_BACKEND=filesystem` |
| Entwicklung mit `bootRun` | Verzeichnis `<Repo>/.data/files` (`STORAGE_DIRECTORY` aus `.env.example`) |
| Optional | S3-kompatibler Speicher mit `STORAGE_BACKEND=s3` und den `S3_*`-Werten |

### Speicher-Schlüssel
```text
{purpose}/{ziel_oder_eigentümer_uuid}/{datei_uuid}.{png|jpg|gif}   # purpose: profile, event, drink, moment
moment/{moment_uuid}/{datei_uuid}.bin                               # Fotos und Videos aus Moments
group/{gruppen_uuid}/{datei_uuid}.bin                               # Bild der Gruppe
```

### Sicherheit
- Jede Datei wird vor dem Hochladen mit `DATA_ENCRYPTION_KEY` (AES-256-GCM) verschlüsselt; Moment-Medien in 64-KiB-Blöcken, damit auch Videos gestreamt statt ganz im Speicher gehalten werden.
- Bilder werden vor dem Verschlüsseln von EXIF/XMP-Metadaten (z. B. GPS) befreit, Videos von Orts- und Geräteangaben.
- Der Browser lädt Dateien nie direkt aus dem Speicher, sondern nur über berechtigungsgeprüfte Endpunkte des baseservice (`/api/v1/images/{id}/content`, `/api/v1/moments/{momentId}/media/{mediaId}/content` mit HTTP-Range für Videos).
- Mit S3 spricht nur der baseservice (`S3ObjectStorage.kt`); er signiert seine Anfragen selbst (SigV4, `S3_URL_TTL_SECONDS`) und gibt keine Links an Clients heraus.
