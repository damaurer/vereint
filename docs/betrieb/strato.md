# Betrieb auf einem Strato VPS

Vereint läuft auf einem einzelnen Linux-Server mit Docker Compose. Diese Seite
beschreibt den Betrieb auf einem **Strato VPS** und ist zugleich die
Checkliste für den ersten Go-Live. Auf jedem anderen VPS mit Ubuntu oder
Debian (Hetzner, IONOS, netcup, …) funktioniert es genauso; nur die Bestellung
und das DNS sehen anders aus.

Die AWS-Variante ([AWS und Kosten](aws-und-kosten.md)) bleibt im Repository
und funktioniert weiter. Welches Ziel ausgerollt wird, entscheidet allein die
GitHub-Variable `DEPLOY_HOST` (gesetzt: eigener Server per SSH, leer: AWS).

## Der Plan

```text
GitHub Actions ──SSH (nur „deploy“/„rollback“)──▶ Strato VPS (Ubuntu 24.04)
                                                   ├─ Caddy (HTTPS, Let's Encrypt)
Internet ──443──▶ Caddy ──▶ Keycloak, webservice ──▶ baseservice ──▶ PostgreSQL
                                                   │                 └─ /srv/vereint/data/files
                                                   └─ nachts: Backup ──rclone──▶ HiDrive (o. ä.)
```

| Thema | AWS (bisher geplant) | Strato |
| :--- | :--- | :--- |
| Server | EC2 `t4g.small` (2 GB), Terraform | VPS M (4 GB) oder L (8 GB), von Hand bestellt, `bin/server-setup.sh` richtet ein |
| Secrets | SSM Parameter Store | `/srv/vereint/secrets.env` (nur root, Rechte 600) |
| Bilder und Videos | S3-Bucket | Verzeichnis `/srv/vereint/data/files` (`STORAGE_BACKEND=filesystem`), von der App verschlüsselt |
| Deployment | OIDC + Systems Manager | SSH mit eigenem Schlüssel, der nur `deploy` und `rollback` darf |
| Backups außer Haus | S3 (versioniert) | per rclone an ein beliebiges Ziel, empfohlen Strato HiDrive |
| Backup-Alarm | CloudWatch | healthchecks.io (kostenlos) über `BACKUP_PING_URL` |
| Disk-Snapshots | täglich | gibt es beim Strato VPS nicht; die nächtlichen Backups sind die Sicherung |
| Keycloak-Konsole | Session-Manager-Tunnel | SSH-Tunnel |

Alles andere bleibt gleich: dieselben Images, dieselbe `compose.yaml`, Health
Check und automatischer Rollback, Backup vor jedem Deployment mit
Probe-Wiederherstellung, Verschlüsselung von Chat, Bildern und Videos in der
App.

### Server-Größe und Kosten

Stand der Strato-Seite am 28.10.2026, Preise inklusive Mehrwertsteuer:

| Tarif | vCores | RAM | NVMe | Preis bei 12 Monaten Laufzeit |
| :--- | :--- | :--- | :--- | :--- |
| VPS S | 1 | 2 GB | 60 GB | 2 € für 3 Monate, dann 4 €/Monat |
| **VPS M (Empfehlung)** | 2 | 4 GB | 120 GB | 3 € für 3 Monate, dann 10 €/Monat |
| VPS L | 4 | 8 GB | 240 GB | 5 € für 3 Monate, dann 20 €/Monat |

Bei monatlicher Kündbarkeit kosten die Tarife den Endpreis ab dem ersten Monat
plus 9 € Einrichtung. Die Container brauchen zusammen höchstens etwa 2,1 GB
Arbeitsspeicher; VPS S wäre zu knapp, VPS M hat Luft, VPS L lohnt sich erst bei
vielen Gruppen oder vielen Videos. Ein Wechsel auf einen größeren Tarif ist
später möglich.

Dazu kommen die Domain (bei Strato oder anderswo, etwa 1 €/Monat) und das
Backup-Ziel (HiDrive oder Storage Box, je nach Tarif wenige Euro im Monat).
Zusammen also etwa **12 bis 16 € im Monat**, statt rund 25 € bei AWS.

### Was der Code dafür jetzt kann

- **Dateien im Server-Verzeichnis:** `STORAGE_BACKEND=filesystem` legt Bilder
  und Videos unter `/srv/vereint/data/files` ab (atomar geschrieben,
  Schlüssel können das Verzeichnis nicht verlassen). S3 bleibt mit
  `STORAGE_BACKEND=s3` möglich, auch mit einem anderen S3-kompatiblen Anbieter
  (`S3_ENDPOINT`, `S3_PATH_STYLE_ACCESS`).
- **Secrets ohne AWS:** `bin/fetch-env.sh` liest `/srv/vereint/secrets.env`,
  wenn es sie gibt, und prüft, dass alle Pflichtwerte gesetzt sind und die
  Datei nur für root lesbar ist.
- **Backups außer Haus per rclone:** `bin/backup.sh` legt die verschlüsselten
  Dumps 7 Tage auf dem Server ab und kopiert sie nach `BACKUP_REMOTE`
  (30 Tage). Die Dateien spiegelt es dorthin; gelöschte oder ersetzte Dateien
  bleiben 30 Tage in `files-geloescht/`. `bin/restore.sh` holt Datenbanken und
  Dateien zurück.
- **Server-Einrichtung in einem Schritt:** `bin/server-setup.sh` (siehe
  Schritt 5).
- **Deployment per SSH:** `.github/scripts/ssh-run.sh` schickt das Bundle über
  SSH. Auf dem Server lässt der Schlüssel nur `deploy` oder `rollback` zu
  (erzwungener Befehl, keine Shell, keine Port-Weiterleitung), und der Server
  wird nur mit dem hinterlegten Fingerabdruck akzeptiert.

## Checkliste für den Go-Live

Reihenfolge einhalten. Wo `app.example.de` steht, die eigene App-Domain
einsetzen, wo `203.0.113.10` steht, die IP des Servers.

### 1. Vorab entscheiden

- [ ] **Domain:** Name festlegen. Frei waren am 21.10.2026 zum Beispiel
      `vereintapp.de` und `vereintapp.com`. Die App läuft auf einer Subdomain
      (`app.vereintapp.de`), die Website auf der Domain selbst und `www`.
- [ ] **Server-Tarif:** VPS M mit 12 Monaten Laufzeit (siehe oben).
- [ ] **Backup-Ziel:** Strato HiDrive (bleibt beim selben Anbieter, Rechenzentrum
      in Deutschland) oder eine Hetzner Storage Box. Wichtig ist nur: nicht auf
      demselben Server.

### 2. Bei Strato bestellen

- [ ] Unter [strato.de/server/vps](https://www.strato.de/server/vps/) den
      **VPS M** bestellen. Als Betriebssystem **Ubuntu 24.04 LTS** wählen.
- [ ] Die Domain dazu bestellen (oder bei einem anderen Anbieter, dann dort
      das DNS pflegen).
- [ ] Nach der Bereitstellung im Strato-Kunden-Login unter dem Server die
      **IPv4-Adresse** und das **root-Passwort** notieren.
- [ ] Im Kunden-Login den **Auftragsverarbeitungsvertrag (AVV)** mit Strato
      abschließen. Er ist Pflicht, sobald personenbezogene Daten anderer
      Menschen auf dem Server liegen, und deckt auch HiDrive ab.

### 3. DNS setzen

- [ ] Im DNS der Domain einen **A-Record** `app` → `203.0.113.10` anlegen.
- [ ] Für die Website (falls sie bleibt) zusätzlich A-Records für die Domain
      selbst (`@`) und `www` auf dieselbe IP.
- [ ] Keine AAAA-Records (IPv6) eintragen, solange IPv6 auf dem Server nicht
      getestet ist; sonst scheitert das Zertifikat für Nutzer mit IPv6.
- [ ] Prüfen, bevor es weitergeht: `nslookup app.example.de` muss die IP
      liefern. Das kann bis zu einer Stunde dauern. **Ohne DNS bekommt Caddy
      kein Zertifikat und der Login scheitert.**

### 4. SSH-Schlüssel anlegen (auf dem eigenen Rechner)

Unter Windows in PowerShell, unter macOS/Linux im Terminal:

- [ ] Eigenen Schlüssel erzeugen, falls noch keiner da ist:
      `ssh-keygen -t ed25519 -C "maurer"` (Passphrase vergeben).
- [ ] Ihn auf den Server bringen (fragt einmal nach dem root-Passwort):
      - macOS/Linux: `ssh-copy-id root@203.0.113.10`
      - Windows: `type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@203.0.113.10 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`
- [ ] Testen: `ssh root@203.0.113.10` muss ohne root-Passwort klappen.
- [ ] Zweiten Schlüssel nur für GitHub erzeugen, **ohne** Passphrase:
      `ssh-keygen -t ed25519 -N "" -C github-actions-deploy -f vereint-deploy`.
      Das ergibt `vereint-deploy` (privat, kommt in Schritt 9 zu GitHub) und
      `vereint-deploy.pub` (öffentlich, kommt auf den Server).

### 5. Server einrichten

Im Ordner des Repositorys (`develop` bzw. `main` nach dem Merge dieses Stands):

- [ ] Skripte und den öffentlichen Deploy-Schlüssel hochladen:
      ```bash
      scp -r deploy/bin root@203.0.113.10:/root/vereint-setup
      scp vereint-deploy.pub root@203.0.113.10:/root/vereint-setup/
      ```
- [ ] Auf dem Server einrichten (dauert ein paar Minuten):
      ```bash
      ssh root@203.0.113.10
      bash /root/vereint-setup/server-setup.sh \
        --domain app.example.de \
        --website-domain "example.de, www.example.de" \
        --deploy-key "$(cat /root/vereint-setup/vereint-deploy.pub)"
      ```
      `--website-domain` weglassen, wenn es keine Website gibt. Das Skript
      bricht ab, wenn root noch keinen SSH-Schlüssel hat, damit man sich nicht
      aussperrt.
- [ ] Die Ausgabe am Ende aufheben: Sie enthält die Zeile für
      `DEPLOY_SSH_KNOWN_HOSTS` (Schritt 9).
- [ ] **Bevor** das Fenster zugeht, in einem zweiten Terminal
      `ssh root@203.0.113.10` testen. Ab jetzt geht SSH nur noch mit Schlüssel.

Was das Skript erledigt: Systemupdates und automatische Sicherheitsupdates
(Neustart bei Bedarf um 04:00 UTC), Docker, Firewall `ufw` (nur 22, 80, 443),
fail2ban gegen Passwort-Raten, Swap, Benutzer `deploy` für GitHub,
Verzeichnisse unter `/srv/vereint` und `secrets.env` mit zufälligen Passwörtern
und Schlüsseln. Es kann gefahrlos noch einmal laufen; vorhandene Werte bleiben.

### 6. Strato-Firewall (optional, zusätzlich)

- [ ] Im Kunden-Login die vorgelagerte Firewall des Servers einschalten und nur
      TCP 22, TCP 80, TCP 443 und UDP 443 erlauben. `ufw` auf dem Server tut
      dasselbe; doppelt hält besser.

### 7. Schlüssel offline sichern

- [ ] Auf dem Server `cat /srv/vereint/secrets.env` und die **ganze Datei** als
      sichere Notiz im Passwort-Manager ablegen. Unverzichtbar sind:
      - `DATA_ENCRYPTION_KEY`: ohne ihn sind Chat, Bilder und Videos auch aus
        intakten Backups nicht mehr lesbar.
      - `BACKUP_ENCRYPTION_KEY`: ohne ihn lassen sich die Datenbank-Backups
        nicht entschlüsseln.
      - `KEYCLOAK_ADMIN_PASSWORD`: Zugang zur Keycloak-Konsole.
- [ ] Die Datei nie in Git, Chat oder E-Mail kopieren.

### 8. Backups außer Haus einrichten

**Variante HiDrive** (Strato):

- [ ] HiDrive buchen (kleinster Tarif reicht für den Anfang).
- [ ] Auf dem eigenen Rechner [rclone](https://rclone.org/downloads/)
      installieren und `rclone authorize "hidrive"` ausführen. Es öffnet den
      Browser, nach dem Login gibt es einen Token-Text aus.
- [ ] Auf dem Server `rclone config --config /srv/vereint/rclone.conf`:
      `n` (neu), Name `hidrive`, Typ `hidrive`, alle Fragen mit Enter
      übernehmen, bei „Use web browser to automatically authenticate?“ `n`
      und den Token-Text einfügen.
- [ ] Testen: `rclone --config /srv/vereint/rclone.conf mkdir hidrive:vereint-backup`
      und `rclone --config /srv/vereint/rclone.conf lsd hidrive:`.

**Variante Storage Box** (Hetzner, per SFTP): in `rclone config` Typ `sftp`,
Host `uXXXXX.your-storagebox.de`, Port 23, Benutzer und Passwort der Box; Name
z. B. `storagebox`.

Danach in beiden Fällen:

- [ ] `nano /srv/vereint/secrets.env` und `BACKUP_REMOTE=hidrive:vereint-backup`
      (bzw. `storagebox:vereint-backup`) eintragen.
- [ ] Bei [healthchecks.io](https://healthchecks.io) (kostenlos) einen Check
      anlegen: Period 1 Tag, Grace 2 Stunden, E-Mail-Benachrichtigung an.
      Die Ping-URL als `BACKUP_PING_URL=https://hc-ping.com/...` eintragen.
      Bleibt das nächtliche Backup aus, kommt eine E-Mail.

### 9. GitHub einrichten

Unter *Settings → Environments* im Repository:

- [ ] Environment **`production`** anlegen, unter *Deployment branches and
      tags* nur `main` erlauben (optional *Required reviewers*: sich selbst,
      dann wartet jedes Deployment auf einen Klick).
- [ ] *Environment secret* `DEPLOY_SSH_KEY` = kompletter Inhalt der Datei
      `vereint-deploy` (privater Schlüssel, inklusive der Zeilen `-----BEGIN`
      und `-----END`).
- [ ] *Environment variables*:
      - `DEPLOY_HOST` = `203.0.113.10` (die IP, genau wie in der
        Fingerabdruck-Zeile)
      - `DEPLOY_SSH_KNOWN_HOSTS` = die Zeile aus Schritt 5
        (`203.0.113.10 ssh-ed25519 AAAA...`)
      - optional `DEPLOY_USER` (Standard `deploy`) und `DEPLOY_PORT`
        (Standard `22`)
- [ ] Die Datei `vereint-deploy` danach vom eigenen Rechner löschen (oder im
      Passwort-Manager ablegen). Geht sie verloren, einfach neu erzeugen und
      Schritt 5 mit dem neuen öffentlichen Schlüssel wiederholen.
- [ ] Branch-Schutz für `main` (sinnvoll auch für `qs` und `develop`): Pull
      Request vor dem Merge, CI-Checks als Pflicht, kein Force-Push.
- [ ] GitHub Actions müssen laufen: Im Oktober war das Minutenkontingent
      aufgebraucht. Es erneuert sich am 1. November; für ein öffentliches
      Repository (Open Source) sind die Standard-Runner ohnehin kostenlos.

### 10. Rechtliches vor dem Öffnen für andere

- [ ] AVV mit Strato abgeschlossen (Schritt 2).
- [ ] Platzhalter in `webservice/src/app/legal/legal-operator.ts` ausfüllen
      (Name, Anschrift, Kontakt), siehe [Rechtliches](../domains/rechtliches.md).
- [ ] Datenschutzerklärung erstellen; sie muss Strato als Hoster und das
      Backup-Ziel als Auftragsverarbeiter nennen.
- [ ] Bis dahin bleibt `SIGNUP_ENABLED=false` in `secrets.env` (so legt es
      `server-setup.sh` an): Niemand kann selbst Gruppen eröffnen,
      Einladungslinks funktionieren trotzdem.

### 11. Ausrollen

- [ ] `develop` nach `main` mergen (gern über `qs`). Die drei Image-Workflows
      starten von selbst, danach rollt *Deployment (Produktion)* aus.
- [ ] Gibt es auf `main` noch keine Images: unter *Actions* die Workflows
      `baseservice CI/CD`, `webservice CI/CD` und `keycloak CI/CD` je einmal
      mit *Run workflow* auf `main` starten.
- [ ] Im Log von *Deployment (Produktion)* muss am Ende
      `Deployment erfolgreich` stehen. Beim ersten Mal holt Caddy das
      Zertifikat; das dauert ein bis zwei Minuten.
- [ ] `https://app.example.de` im Browser öffnen.

### 12. Ersten Administrator anlegen

- [ ] Tunnel zur Keycloak-Konsole öffnen (Fenster offen lassen):
      `ssh -L 8082:127.0.0.1:8082 root@203.0.113.10`
- [ ] `http://localhost:8082/kc/admin` öffnen, Benutzer `admin`, Passwort
      `KEYCLOAK_ADMIN_PASSWORD` aus `secrets.env`.
- [ ] Im Realm `vereint` den eigenen Benutzer anlegen, Passwort setzen
      (*Temporary* an) und die Realmrolle `admin` zuweisen. Die Schritte im
      Detail: [deploy/README.md](../../deploy/README.md#ersten-administrator-anlegen).
- [ ] In der App anmelden: Man wird automatisch Admin der Gruppe
      „Meine Gruppe“ und benennt sie unter *Gruppeneinstellungen* um.

### 13. Prüfen

- [ ] Einladungslink erzeugen und mit einem zweiten Konto testen.
- [ ] Am Handy: Barcode-Kamera, Web Push, ein Bild und ein kurzes Video in
      Moments.
- [ ] Thekentablet einrichten, Kiosk-Modus starten und über
      *Vorstand → Kiosk-Geräte* entsperren.
- [ ] **Backup sofort testen:** `systemctl start vereint-backup.service`, dann
      `journalctl -u vereint-backup.service -n 30` muss mit
      `Backup … erfolgreich` enden, und im HiDrive liegen
      `vereint-backup/postgres/...` und `vereint-backup/files/...`.
      Bei healthchecks.io steht der Check auf „up“.
- [ ] Am nächsten Morgen prüfen, dass das nächtliche Backup (01:30 UTC) lief.

### 14. Überwachung

- [ ] Bei [UptimeRobot](https://uptimerobot.com) oder healthchecks.io
      (beide kostenlos) einen HTTP-Monitor auf
      `https://app.example.de/api/v1/health` anlegen. Fällt der Server aus,
      kommt eine E-Mail.

## Im Betrieb

| Was | Wie |
| :--- | :--- |
| Sicherheitsupdates | automatisch, Neustart bei Bedarf um 04:00 UTC; die Container starten danach von selbst |
| Neue Version | Merge nach `main` rollt aus, mit Backup vorher und Rollback bei Fehlern |
| Zurückrollen | *Actions → Deployment (Produktion) → Run workflow → rollback* oder auf dem Server `/srv/vereint/app/bin/deploy.sh rollback` |
| Wert ändern (z. B. `SIGNUP_ENABLED`) | `nano /srv/vereint/secrets.env`, dann neu ausrollen (*Run workflow → deploy*) |
| Datenbank zurückholen | `/srv/vereint/app/bin/restore.sh vereint` (neuestes Backup) oder mit Pfad eines älteren, siehe [Backups](backups-und-wiederherstellung.md) |
| Dateien zurückholen | `/srv/vereint/app/bin/restore.sh files` |
| Speicherplatz | `df -h /srv`; Videos sind der größte Posten. Bei Bedarf größeren Tarif wählen |
| Zustand | `cd /srv/vereint/app && docker compose ps`, Logs mit `docker compose logs -f --tail=100 baseservice` |

### Server komplett verloren

1. Neuen VPS bestellen, Schritte 4 und 5 wiederholen (mit derselben Domain).
2. In `/srv/vereint/secrets.env` die **gesicherten Werte aus dem
   Passwort-Manager** einsetzen, vor allem `DATA_ENCRYPTION_KEY`,
   `BACKUP_ENCRYPTION_KEY` und die Datenbank-Passwörter. Schritt 8 wiederholen.
3. DNS auf die neue IP umstellen, `DEPLOY_HOST` und `DEPLOY_SSH_KNOWN_HOSTS` in
   GitHub anpassen und ausrollen.
4. Dateien zurückholen: `/srv/vereint/app/bin/restore.sh files`.
5. Datenbanken zurückholen: `/srv/vereint/app/bin/restore.sh keycloak` und
   `/srv/vereint/app/bin/restore.sh vereint` (holen das neueste Backup aus
   `BACKUP_REMOTE`).

Datenverlust in diesem Fall: höchstens die Änderungen seit dem letzten
nächtlichen Backup bzw. dem letzten Deployment.
