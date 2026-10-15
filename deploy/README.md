# Produktionsbetrieb

Dieser Ordner ist alles, was auf dem Server liegt (`/srv/vereint/app`). Der
Server selbst entsteht mit Terraform (`infra/aws`).

```text
Internet ──443──▶ Caddy ──┬─ /kc/*  ──▶ Keycloak ─┐
 (HTTPS, HTTP/3)          └─ /*     ──▶ webservice ──▶ baseservice
                                                      │
                                     PostgreSQL ◀─────┘     S3 (Dateien)
```

| Dienst | Image | Aufgabe |
|---|---|---|
| `caddy` | `caddy` | TLS-Zertifikat (Let's Encrypt, automatisch), HSTS, Weiterleitung |
| `keycloak` | `ghcr.io/damaurer/keycloak` | Login unter `https://<domain>/kc` |
| `webservice` | `ghcr.io/damaurer/webservice` | Angular SSR und BFF |
| `baseservice` | `ghcr.io/damaurer/baseservice` | Fachlogik und API |
| `postgres` | `postgres` | Eine Instanz mit den Datenbanken `keycloak` und `vereint` |

Die drei eigenen Images werden nie über einen veränderlichen Tag ausgerollt,
sondern über ihren Digest (`images.env`). Was einmal getestet lief, läuft beim
Rollback exakt genauso wieder.

## Sicherheit

- **Verschlüsselt übertragen:** Von außen nur HTTPS (HTTP leitet um, HSTS ist
  aktiv). Container sprechen die öffentliche Domain direkt über Caddy an, also
  ebenfalls über TLS.
- **Verschlüsselt gespeichert:** Disks (EBS) und S3 sind verschlüsselt, Backups
  zusätzlich mit GnuPG (AES-256), bevor sie den Server verlassen.
- **Inhalte zusätzlich in der App verschlüsselt:** Chat-Nachrichten,
  Benachrichtigungen und Bilddateien verschlüsselt der baseservice mit
  `DATA_ENCRYPTION_KEY` (AES-256-GCM), bevor sie in PostgreSQL oder S3 landen.
  Auch Datenbank-Dumps und Bucket-Inhalte sind ohne diesen Schlüssel unlesbar.
- **Keycloak-Verwaltung nicht öffentlich:** Admin-Konsole und Master-Realm
  liefern von außen 404. Erreichbar sind sie nur per Tunnel (siehe unten).
- **Web Push:** Terraform erzeugt das VAPID-Schlüsselpaar und legt es unter
  `/vereint/VAPID_*` ab. Pushes enthalten keine Inhalte; das Gerät lädt die
  Mitteilung mit seiner Sitzung nach. Geht der Schlüssel verloren, ist nichts
  verloren: Geräte melden sich beim nächsten App-Start mit dem neuen Schlüssel an.
- **Secrets** stehen nur im SSM Parameter Store. `bin/fetch-env.sh` schreibt sie
  bei jedem Deployment in `.env` (nur für root lesbar).
- Container laufen ohne Root (eigene Images), mit `no-new-privileges`, ohne
  Linux-Capabilities (nur Caddy und PostgreSQL bekommen die wenigen, die sie
  brauchen), mit Prozess- und Speicherlimits. baseservice und webservice haben
  ein schreibgeschütztes Dateisystem; nur `/tmp` liegt im Arbeitsspeicher.
- **Fremde Seiten können nichts auslösen:** Der webservice lehnt schreibende
  Anfragen ab, die nicht von der eigenen Seite kommen (`Sec-Fetch-Site` bzw.
  `Origin`). Das schützt auch vor anderen Subdomains derselben Domain.
- **Raten wird gebremst:** Einladungs- und Gast-Token-Endpunkte erlauben
  30 Versuche je IP in 15 Minuten, der Login-Start 120 je IP in 5 Minuten, die
  übrige API 600 Anfragen je Sitzung und Minute. Passwörter schützt zusätzlich
  Keycloak (5 Fehlversuche, dann wachsende Sperre).
- **API nur unter `/api/v1`:** Der webservice reicht keine Pfade mit `..` oder
  kodierten Schrägstrichen weiter; die API-Beschreibung (Swagger) ist in
  Produktion abgeschaltet.
- **Fotos ohne Standort:** Der baseservice entfernt EXIF/XMP-Metadaten (GPS,
  Gerät, Aufnahmezeit) aus hochgeladenen JPEG- und PNG-Bildern, bevor er sie
  verschlüsselt speichert. Nur die Ausrichtung bleibt erhalten.
- **Keycloak:** Passwörter mit 10 bis 128 Zeichen, nicht gleich Benutzername
  oder E-Mail, nicht eines der letzten drei. Login- und Admin-Ereignisse werden
  90 Tage gespeichert (Admin-Konsole, Realm `vereint`, *Events*) und zusätzlich
  in `docker compose logs keycloak` protokolliert.
- **Caddy:** Anfragen über 8 MB werden abgewiesen; `Permissions-Policy`
  schaltet Mikrofon, Standort, Zahlungen usw. ab (Kamera nur für den
  Barcode-Scan).
- **Lieferkette:** GitHub Actions sind auf Commit-SHAs gepinnt, Images auf
  Digests; Dependabot hält beides aktuell.

### Einmalige Einstellungen in GitHub (von Hand)

Die AWS-Rolle für Deployments vertraut jedem Job im Environment `production`.
Damit nur `main` ausrollen kann, unter *Settings → Environments → production*:

1. *Deployment branches and tags*: **Selected branches and tags**, Regel `main`.
2. Optional *Required reviewers*: sich selbst eintragen, dann wartet jedes
   Deployment auf eine Freigabe per Klick.

Unter *Settings → Branches* (bzw. *Rules → Rulesets*) für `main`, `qs` und
`develop`: Pull Request vor dem Merge verlangen, die CI-Checks als *required*
markieren und Force-Push sowie Löschen verbieten.

### Realm-Einstellungen in einem bestehenden Keycloak

Keycloak liest `realm-export.json` nur beim allerersten Start. Wurde der Realm
schon importiert, die Härtung einmal von Hand nachziehen (Admin-Konsole per
Tunnel, Realm `vereint`):

- *Authentication → Policies → Password policy*: Minimum length 10, Maximum
  length 128, Not username, Not email, Password history 3.
- *Realm settings → Events*: User events und Admin events einschalten,
  Ablauf 90 Tage.

## Backups

Jede Nacht um 01:30 UTC läuft `bin/backup.sh` (systemd-Timer):

1. `pg_dump` beider Datenbanken.
2. **Probe-Wiederherstellung** jedes Dumps in eine temporäre Datenbank. Nur was
   sich nachweislich wiederherstellen lässt, wird hochgeladen.
3. Verschlüsselung mit `BACKUP_ENCRYPTION_KEY` und Upload nach
   `s3://vereint-backups-<account>/postgres/<db>/<zeitstempel>.dump.gpg`.
4. Erfolgsmeldung an CloudWatch. Bleibt sie länger als 26 Stunden aus, kommt
   eine E-Mail an `alert_email`.

Um 02:30 UTC folgt zusätzlich ein Snapshot des gesamten Datenvolumes.

> **Wichtig:** `BACKUP_ENCRYPTION_KEY` zusätzlich offline aufbewahren
> (Passwort-Manager): `aws ssm get-parameter --name /vereint/BACKUP_ENCRYPTION_KEY --with-decryption`.
> Ohne diesen Schlüssel sind die S3-Backups nicht lesbar.
>
> Genauso `DATA_ENCRYPTION_KEY`: Ohne ihn sind Chat-Nachrichten,
> Benachrichtigungen und Bilder auch aus einem intakten Backup nicht mehr
> lesbar. Zum Rotieren den bisherigen Wert zusätzlich als
> `/vereint/DATA_ENCRYPTION_KEY_PREVIOUS` anlegen, dann einen neuen Schlüssel
> erzeugen (`terraform apply -replace=random_bytes.data_encryption_key`) und neu
> deployen.

### Wiederherstellen

| Situation | Weg |
|---|---|
| Einzelne Datenbank kaputt oder Daten versehentlich gelöscht | `sudo /srv/vereint/app/bin/restore.sh vereint` (oder `keycloak`), optional mit S3-Key eines älteren Backups |
| Datenvolume verloren | Snapshot wiederherstellen (siehe `infra/aws/README.md`) |
| Server komplett verloren | `terraform apply` legt ihn neu an, Datenvolume bleibt erhalten |

`restore.sh` fragt vor dem Überschreiben den Datenbanknamen ab und stoppt den
betroffenen Dienst währenddessen.

## Deployments

Jeder Merge nach `main` rollt automatisch aus (`.github/workflows/deploy.yml`):

1. GitHub Actions wartet, bis alle Image-Builds auf `main` fertig sind, und
   bindet die Images `keycloak`, `baseservice` und `webservice` an ihren
   Digest.
2. Der Job meldet sich per OIDC bei AWS an, legt diesen Ordner samt
   `images.env` unter `deploy/` im Backup-Bucket ab und startet auf dem Server
   per Systems Manager `bin/deploy.sh`. SSH ist dafür nicht nötig.
3. `deploy.sh` zieht die neuen Images, **sichert beide Datenbanken** (wie
   nachts, inklusive Probe-Wiederherstellung; ohne Backup kein Deployment),
   aktiviert den neuen Stand und wartet, bis alle Container gesund sind.
4. Danach prüft es von außen über Caddy, ob `/api/v1/health`, der Login
   (`/kc/realms/vereint/...`) und die Startseite antworten.
5. **Schlägt Schritt 3 oder 4 fehl, startet automatisch wieder der vorherige
   Stand** und der Workflow wird rot. Der fehlgeschlagene Stand liegt zur
   Analyse unter `/srv/vereint/releases/failed`.

Deployments laufen nacheinander, nie gleichzeitig. Während des Neustarts ist die
Anwendung kurz nicht erreichbar (ein Server, ein Container je Dienst).

### Von Hand ausrollen oder zurückrollen

In GitHub unter *Actions → Deployment (Produktion) → Run workflow*:

- `deploy` rollt den aktuellen Stand von `main` erneut aus.
- `rollback` stellt den Stand vor dem letzten Deployment wieder her.

Auf dem Server geht der Rollback auch direkt:
`sudo /srv/vereint/app/bin/deploy.sh rollback`.

### Rollback und Datenbank

Ein Rollback setzt nur die Anwendung zurück, nicht die Datenbank. Liquibase-
Migrationen sollten deshalb immer so geschrieben sein, dass auch der vorherige
Stand mit dem neuen Schema läuft (Spalten erst hinzufügen, später entfernen).
Ist doch einmal der Datenbankstand das Problem, liegt das Backup von direkt vor
dem Deployment in S3: `sudo /srv/vereint/app/bin/restore.sh vereint` wählt
das neueste.

### Erstes Deployment

Voraussetzungen aus `infra/aws/README.md` (Environment `production` mit Secret
und Variablen). Gibt es auf `main` noch keine Images, unter *Actions* die
Workflows `baseservice CI/CD`, `webservice CI/CD` und `keycloak CI/CD` je
einmal mit *Run workflow* auf `main` starten; danach rollt das Deployment von
selbst aus.

## Keycloak-Verwaltung

Tunnel vom eigenen Rechner öffnen und dann `http://localhost:8082/kc/admin`
aufrufen (Benutzer `admin`, Passwort aus `/vereint/KEYCLOAK_ADMIN_PASSWORD`):

```bash
aws ssm start-session --target <instance-id> \
  --document-name AWS-StartPortForwardingSession \
  --parameters portNumber=8082,localPortNumber=8082
```

### Client für Einladungslinks in einem bestehenden Realm

Keycloak importiert `realm-export.json` nur, solange es den Realm noch nicht
gibt. Wurde der Realm vor der Funktion „Mitglieder per Einladungslink“
angelegt, den Client einmal von Hand ergänzen (siehe
`docs/domains/member-invites.md`):

1. `terraform apply` in `infra/aws` legt `/vereint/KEYCLOAK_REGISTRATION_CLIENT_SECRET` an.
2. In der Admin-Konsole im Realm `vereint` einen Client `vereint-registration`
   anlegen: *Client authentication* an, nur *Service accounts roles* aktiv,
   Secret = Wert aus dem Parameter Store.
3. Unter *Service account roles* → *Assign role* → *Client roles*
   `realm-management` / `manage-users` zuweisen, sonst nichts.
4. Neu ausrollen, damit der baseservice das Secret erhält.

## Nützliche Befehle (auf dem Server, als root in `/srv/vereint/app`)

```bash
docker compose ps                         # Zustand aller Dienste
docker compose logs -f --tail=100 webservice
systemctl list-timers vereint-backup.timer
systemctl start vereint-backup.service    # Backup sofort ausführen
journalctl -u vereint-backup.service      # Backup-Protokoll
```
