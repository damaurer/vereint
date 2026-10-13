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

Alle drei eigenen Images werden mit demselben Tag (`IMAGE_TAG`, Commit-SHA)
ausgerollt, sodass immer ein zusammenpassender Stand läuft.

## Sicherheit

- **Verschlüsselt übertragen:** Von außen nur HTTPS (HTTP leitet um, HSTS ist
  aktiv). Container sprechen die öffentliche Domain direkt über Caddy an, also
  ebenfalls über TLS.
- **Verschlüsselt gespeichert:** Disks (EBS) und S3 sind verschlüsselt, Backups
  zusätzlich mit GnuPG (AES-256), bevor sie den Server verlassen.
- **Keycloak-Verwaltung nicht öffentlich:** Admin-Konsole und Master-Realm
  liefern von außen 404. Erreichbar sind sie nur per Tunnel (siehe unten).
- **Secrets** stehen nur im SSM Parameter Store. `bin/fetch-env.sh` schreibt sie
  bei jedem Deployment in `.env` (nur für root lesbar).
- Container laufen ohne Root (eigene Images), mit `no-new-privileges` und
  Speicherlimits, damit ein Dienst nicht den ganzen Server lahmlegt.

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

### Wiederherstellen

| Situation | Weg |
|---|---|
| Einzelne Datenbank kaputt oder Daten versehentlich gelöscht | `sudo /srv/vereint/app/bin/restore.sh vereint` (oder `keycloak`), optional mit S3-Key eines älteren Backups |
| Datenvolume verloren | Snapshot wiederherstellen (siehe `infra/aws/README.md`) |
| Server komplett verloren | `terraform apply` legt ihn neu an, Datenvolume bleibt erhalten |

`restore.sh` fragt vor dem Überschreiben den Datenbanknamen ab und stoppt den
betroffenen Dienst währenddessen.

## Erstes Deployment (manuell)

Ab Schritt 4 übernimmt das GitHub Actions. Bis dahin per Session Manager:

```bash
aws ssm start-session --target <instance-id>   # aus terraform output
sudo -i
mkdir -p /srv/vereint/app && cd /srv/vereint/app
# Inhalt dieses Ordners hierher kopieren, dann:
bin/install.sh
bin/fetch-env.sh <commit-sha>
echo <github-token-mit-read:packages> | docker login ghcr.io -u <github-user> --password-stdin
docker compose pull && docker compose up -d
```

## Keycloak-Verwaltung

Tunnel vom eigenen Rechner öffnen und dann `http://localhost:8082/kc/admin`
aufrufen (Benutzer `admin`, Passwort aus `/vereint/KEYCLOAK_ADMIN_PASSWORD`):

```bash
aws ssm start-session --target <instance-id> \
  --document-name AWS-StartPortForwardingSession \
  --parameters portNumber=8082,localPortNumber=8082
```

## Nützliche Befehle (auf dem Server, als root in `/srv/vereint/app`)

```bash
docker compose ps                         # Zustand aller Dienste
docker compose logs -f --tail=100 webservice
systemctl list-timers vereint-backup.timer
systemctl start vereint-backup.service    # Backup sofort ausführen
journalctl -u vereint-backup.service      # Backup-Protokoll
```
