# Deployment und Rollback

> **Strato / eigener Server:** Dort übernimmt [LinuxServerSetup](https://github.com/damaurer/LinuxServerSetup) das Ausrollen (`deploy vereint <tag>` per SSH, Dump vorher, automatischer Rollback), siehe
> [Betrieb auf einem Strato VPS](strato.md). Diese Seite beschreibt den Weg über AWS.

Auf dem Server liegt der Inhalt von
[`deploy/`](../../deploy/) unter
`/srv/vereint/app`: Docker Compose mit Caddy, Keycloak, webservice, baseservice
und PostgreSQL.

```text
Internet ──443──▶ Caddy ──┬─ /kc/*  ──▶ Keycloak
 (HTTPS, HTTP/3)          └─ /*     ──▶ webservice ──▶ baseservice ──▶ PostgreSQL, S3
```

## Automatisch nach einem Merge nach `main`

Workflow `Deployment (Produktion)`
([.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)). Er startet,
sobald einer der Workflows `baseservice CI/CD`, `webservice CI/CD` oder
`keycloak CI/CD` auf `main` erfolgreich ein Image gepusht hat, oder wenn sich auf
`main` etwas unter `deploy/` geändert hat. Ein Merge, der nur Dokumentation
ändert, rollt nichts aus. Der Job läuft im GitHub-Environment `production`.

1. Wartet, bis die Image-Builds auf `main` fertig sind, und bindet die Images an
   ihren Digest (`images.env`).
2. Meldet sich per **OIDC** bei AWS an (keine gespeicherten AWS-Schlüssel), legt
   das Bundle im Backup-Bucket ab und startet auf dem Server über **Systems
   Manager** `bin/deploy.sh`. SSH ist nicht nötig.
3. `deploy.sh` zieht die neuen Images und **sichert vorher beide Datenbanken**,
   inklusive Probe-Wiederherstellung. Ohne Backup kein Deployment. Nur beim
   allerersten Deployment entfällt das Backup, weil es noch keine Datenbank gibt.
4. Aktiviert den neuen Stand und wartet, bis alle Container gesund sind.
5. **Health Check von außen** über Caddy: `/api/v1/health`, der Login
   (`/kc/realms/vereint/...`) und die Startseite müssen antworten.
6. Schlägt Schritt 4 oder 5 fehl, **startet automatisch der vorherige Stand** und
   der Workflow wird rot. Der fehlgeschlagene Stand liegt zur Analyse unter
   `/srv/vereint/releases/failed`.

Deployments laufen nacheinander, nie gleichzeitig. Während des Neustarts ist die
App kurz nicht erreichbar.

## Von Hand ausrollen oder zurückrollen

In GitHub unter **Actions → Deployment (Produktion) → Run workflow**:

- `deploy` rollt den aktuellen Stand von `main` erneut aus.
- `rollback` stellt den Stand vor dem letzten Deployment wieder her.

Auf dem Server geht es auch direkt: `sudo /srv/vereint/app/bin/deploy.sh rollback`.

## Rollback und Datenbank

Ein Rollback setzt nur die Anwendung zurück, nicht die Datenbank. Deshalb müssen
Liquibase-Migrationen so geschrieben sein, dass auch der vorherige Stand mit dem
neuen Schema läuft (Spalten erst hinzufügen, später entfernen). Ist doch einmal
die Datenbank das Problem: `sudo /srv/vereint/app/bin/restore.sh vereint` nimmt
das Backup von direkt vor dem Deployment (siehe
[Backups und Wiederherstellung](backups-und-wiederherstellung.md)).

## Erstes Deployment

Voraussetzungen aus der [Go-Live-Checkliste](go-live-checkliste.md). Gibt es auf
`main` noch keine Images, unter *Actions* die Workflows `baseservice CI/CD`,
`webservice CI/CD` und `keycloak CI/CD` je einmal mit *Run workflow* auf `main`
starten; danach rollt das Deployment von selbst aus. Der Produktions-Realm hat
keine Benutzer: Den ersten Administrator legt man danach von Hand an
([deploy/README.md, Ersten Administrator anlegen](../../deploy/README.md#ersten-administrator-anlegen)).
Schlägt schon das allererste Deployment fehl, gibt es keinen vorherigen Stand.
Der Workflow wird dann rot mit genau diesem Hinweis, statt einen Rollback zu
melden, den es nicht gab.

## Keycloak-Verwaltung

Die Admin-Konsole ist von außen gesperrt (404). Zugriff per Tunnel vom eigenen
Rechner, danach `http://localhost:8082/kc/admin` öffnen (Benutzer `admin`,
Passwort aus dem Parameter `/vereint/KEYCLOAK_ADMIN_PASSWORD`):

```bash
aws ssm start-session --target <instance-id> \
  --document-name AWS-StartPortForwardingSession \
  --parameters portNumber=8082,localPortNumber=8082
```

## Nützliche Befehle auf dem Server

Als root in `/srv/vereint/app`:

```bash
docker compose ps                              # Zustand aller Dienste
docker compose logs -f --tail=100 webservice   # Logs eines Dienstes
systemctl list-timers vereint-backup.timer     # nächster Backup-Lauf
systemctl start vereint-backup.service         # Backup sofort
journalctl -u vereint-backup.service           # Backup-Protokoll
```

Mehr: [deploy/README.md](../../deploy/README.md)
