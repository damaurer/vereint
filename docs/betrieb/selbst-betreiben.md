# Vereint selbst betreiben

Dieses Repository liefert zwei Container-Images. Wie und wo sie laufen,
entscheidet der Betreiber; das Repository rollt nichts aus.

| Image | Inhalt | Port |
| :--- | :--- | :--- |
| `ghcr.io/damaurer/baseservice` | Fachservice (Spring Boot), REST-API, Liquibase-Migrationen | 8081 |
| `ghcr.io/damaurer/webservice` | Oberfläche (Angular SSR) und BFF mit Session-Cookie | 8080 |

Gebaut und mit Trivy geprüft werden beide bei jedem Pull Request. Nach einem
Merge auf `qs` oder `main` landen sie für `linux/amd64` und `linux/arm64` in
GitHub Packages, getaggt mit dem Commit (`<sha>`) und dem Branch-Namen
(`:main`, `:qs`). Ein Image wird nur neu gebaut, wenn sich sein Ordner
geändert hat; `:main` zeigt also immer auf den neuesten Stand beider Dienste,
der `<sha>`-Tag nur auf den Commit, der das Image gebaut hat.

Ein komplettes, lauffähiges Beispiel aller Dienste ist
[`local/compose.yaml`](../../local/compose.yaml) (lokaler Stack und E2E-Tests).

## Was dazugehört

| Baustein | Anforderung |
| :--- | :--- |
| **Keycloak** | Realm aus [`keycloak/realm-export.json`](../../keycloak/realm-export.json) mit Login-Theme [`keycloak/themes/vereint`](../../keycloak/themes/vereint); Platzhalter siehe [keycloak/README.md](../../keycloak/README.md). Eigener Keycloak oder ein vorhandener mit eigenem Realm. |
| **PostgreSQL** | Ab Version 17. Der baseservice verbindet sich als eigener Benutzer **ohne** Superuser-Rechte, dem die Datenbank gehört, sonst greift die Trennung der Gruppen per Row-Level-Security nicht ([`local/postgres/init-databases.sh`](../../local/postgres/init-databases.sh), [stammtische.md](../domains/stammtische.md#trennung)). |
| **Dateien** | `STORAGE_BACKEND=filesystem` mit einem dauerhaften Volume unter `STORAGE_DIRECTORY` (das Image legt `/data/files` für Benutzer 10001 an), oder S3 mit `STORAGE_BACKEND=s3`. |
| **Reverse Proxy mit HTTPS** | Leitet alles an den webservice. Anfragen höchstens 8 MB, außer auf dem Upload-Pfad `/api/v1/moments/<id>/media` (bis 110 MB, ungepuffert). Kamera und Standort per `Permissions-Policy` nur für die eigene Seite. Vorbild: [`local/Caddyfile`](../../local/Caddyfile). |
| **Backups** | Datenbank und Datei-Volume regelmäßig und außer Haus sichern, am besten auch direkt vor jedem Update. |

## Konfiguration

**baseservice**

| Variable | Bedeutung |
| :--- | :--- |
| `VEREINT_DB_URL`, `VEREINT_DB_USERNAME`, `VEREINT_DB_PASSWORD` | Datenbank (Benutzer ohne Superuser-Rechte) |
| `EV_LIQUIBASE_ENABLED=true`, `EV_LIQUIBASE_CONTEXTS=prod` | Migrationen beim Start |
| `KEYCLOAK_ISSUER_URI`, optional `KEYCLOAK_JWK_SET_URI` | Öffentliche Adresse des Realms, interne Adresse der Schlüssel |
| `VEREIN_CORS_ALLOWED_ORIGINS` | Öffentliche Adresse der App |
| `STORAGE_BACKEND`, `STORAGE_DIRECTORY` | Dateispeicher |
| `DATA_ENCRYPTION_ENABLED=true`, `DATA_ENCRYPTION_KEY`, optional `DATA_ENCRYPTION_KEY_PREVIOUS` | Verschlüsselung von Chat, Mitteilungen, Bildern und Videos |
| `REGISTRATION_ENABLED=true`, `KEYCLOAK_ADMIN_BASE_URL`, `KEYCLOAK_REGISTRATION_CLIENT_SECRET` | Konten über Einladungslinks anlegen |
| `SIGNUP_ENABLED`, `SIGNUP_MAX_OWNED` | Eigene Gruppen eröffnen (erst einschalten, wenn Impressum, AGB und Datenschutzerklärung fertig sind) |
| `VAPID_ENABLED`, `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push (optional) |

**webservice**

| Variable | Bedeutung |
| :--- | :--- |
| `PUBLIC_BASE_URL` | Öffentliche Adresse der App |
| `SPRING_API_BASE_URL` | Interne Adresse des baseservice |
| `KEYCLOAK_ISSUER_URI`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` | Login über den Client `vereint-web` |
| `SESSION_SECRET`, optional `SESSION_SECRET_PREVIOUS`, `SESSION_COOKIE_SECURE=true` | Sitzungs-Cookie |

Alle Secrets mindestens 32 Zeichen, zum Beispiel `openssl rand -hex 32`;
`DATA_ENCRYPTION_KEY` mit `openssl rand -base64 32`. Weitere Variablen:
[baseservice](../baseservice/01-overview-and-setup.md),
[webservice](../backend-for-frontend/README.md).

## Erster Start

1. Keycloak mit dem Realm starten. Er enthält keine Benutzer.
2. In der Keycloak-Verwaltung im Realm `vereint` einen Benutzer anlegen
   (Passwort mit *Temporary*, *Email verified* an) und ihm die Realm-Rolle
   `admin` geben. Das macht ihn zur **Plattform-Admin** (Gruppen unter
   `/plattform` anlegen, umbenennen, archivieren).
3. baseservice und webservice starten und mit diesem Benutzer anmelden. Er
   wird Admin der noch nie genutzten Gruppe „Meine Gruppe“ und benennt sie
   unter *Gruppeneinstellungen* um. Alle weiteren Mitglieder kommen per
   Einladungslink; Rollen vergibt jede Gruppe in der App, Realmrollen wie
   `board` oder `member` wirken nicht.
4. „Passwort vergessen“ ist im Realm aus, weil Vereint keine E-Mails
   verschickt. Ein neues Passwort setzt die Keycloak-Verwaltung
   (*Users → Benutzer → Credentials → Reset password*, *Temporary* an).

## Updates

Neue Images ziehen und die Container neu starten; Liquibase migriert die
Datenbank beim Start des baseservice. Migrationen gehen beim Zurückrollen auf
ein älteres Image nicht automatisch rückwärts. Passt eine ältere Version nicht
zur neueren Datenbank, die Datenbank aus dem Backup vor dem Update
zurückholen. Beide Images sollten aus demselben Stand von `main` stammen.

## Schlüssel offline sichern

`DATA_ENCRYPTION_KEY` zusätzlich außerhalb des Servers aufbewahren. Ohne ihn
sind Chat, Bilder und Videos auch aus einem intakten Backup nicht lesbar.
Mehr: [Sicherheit und Schlüssel](sicherheit-und-schluessel.md).
