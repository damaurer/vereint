# Betrieb auf einem Strato VPS

Vereint läuft auf einem Strato VPS, den
[LinuxServerSetup](https://github.com/damaurer/LinuxServerSetup) per Ansible
einrichtet. Dieses Repo liefert die Images und die Pipeline, LinuxServerSetup
den Server: Härtung, Traefik mit HTTPS, Admin-Login mit 2FA, Monitoring,
restic-Backups nach HiDrive und den Deploy-Zugang. Vereint ist dort eine
eigene Rolle (`vereint`), beschrieben in
[docs/vereint.md](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/vereint.md).

Diese Seite ist zugleich die Checkliste für den ersten Go-Live. Die
AWS-Variante ([AWS und Kosten](aws-und-kosten.md), [`deploy/`](../../deploy/))
bleibt im Repository. Welches Ziel ausgerollt wird, entscheidet die
Repository-Variable `APP_NAME` (gesetzt: eigener Server, leer: AWS).

## Der Plan

```text
GitHub Actions ──SSH: „deploy vereint release-<commit>“──▶ Strato VPS (Ubuntu 24.04)
                                                           /opt/stacks/apps/vereint
Internet ──443──▶ Traefik ─┬─ app.DOMAIN/kc ──▶ vereint-keycloak ─┐
                           ├─ app.DOMAIN    ──▶ vereint-web ──▶ vereint-api ──▶ vereint-db
                           └─ vereint-admin.DOMAIN/kc (Admin-Login, 2FA) ─┘      Volume files
                                         nachts 03:00: restic ──SFTP──▶ HiDrive
```

| Thema | AWS (bisher geplant) | Strato mit LinuxServerSetup |
| :--- | :--- | :--- |
| Server | EC2 `t4g.small`, Terraform | VPS L, Ansible (`site.yml`) |
| HTTPS | Caddy | Traefik der Plattform, Let's Encrypt |
| Secrets | SSM Parameter Store | Ansible Vault (`vault_vereint_*`), auf dem Server nur in Dateien für root |
| Bilder und Videos | S3-Bucket | Docker-Volume `vereint_files` (`STORAGE_BACKEND=filesystem`), von der App verschlüsselt |
| Deployment | OIDC und Systems Manager | SSH als Benutzer `deploy`, der nur `deploy <app> <tag>` darf |
| Datenbank-Backup | `pg_dump` nach S3 | `pg_dumpall` vor jedem Deployment und nachts (Label `backup.postgres`) |
| Backups außer Haus | S3 (versioniert) | restic nach HiDrive (7 tägliche, 4 wöchentliche, 6 monatliche Stände), optional Kopie auf die NAS |
| Keycloak-Verwaltung | Session-Manager-Tunnel | `https://vereint-admin.DOMAIN/kc/admin` nach Admin-Login mit 2FA |
| Überwachung | CloudWatch | Grafana, Alertmanager und Uptime Kuma der Plattform |

Gleich bleiben die Images, Health Checks mit automatischem Rollback, die
Verschlüsselung von Chat, Bildern und Videos in der App und die Trennung der
Gruppen per Row-Level-Security.

### Was der Code dafür kann

- **Dateien ohne S3:** `STORAGE_BACKEND=filesystem` legt Bilder und Videos in
  ein Verzeichnis (Schreiben atomar, Pfade gegen Ausbruch geprüft). Die Inhalte
  sind wie bisher mit `DATA_ENCRYPTION_KEY` verschlüsselt. `STORAGE_BACKEND=s3`
  bleibt möglich, auch mit HiDrive S3.
- **Gemeinsamer Release-Tag:** Die Image-Workflows bauen nur, was sich
  geändert hat. Der Job `server` in
  [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) friert
  deshalb den Stand `:main` aller drei Images als `release-<12 Zeichen Commit>`
  ein und rollt genau diesen Tag aus.
- **Auf dem Server (LinuxServerSetup):** `app-deploy` sichert vor jedem
  Deployment die Datenbank, wartet auf gesunde Container und setzt bei einem
  Fehler den vorherigen Tag wieder ein. Die Keycloak-Verwaltung, der
  Master-Realm und die Client-Registrierung sind unter der App-Adresse gesperrt.

### Server-Größe und Kosten

LinuxServerSetup empfiehlt den **VPS L** (4 vCores, 8 GB RAM, 240 GB NVMe,
20 €/Monat bei 12 Monaten Laufzeit, Stand 10/2026), weil neben Vereint auch
Keycloak der Plattform, Grafana, Prometheus, Loki und Uptime Kuma laufen.
Vereint selbst braucht etwa 2 GB. Der VPS M (4 GB) reicht für beides nicht.

Dazu kommen die Domain (etwa 1 €/Monat) und HiDrive mit Protokoll-Paket für
SFTP (je nach Größe einige Euro im Monat). Zusammen etwa **25 bis 30 € im
Monat**; der Server trägt dann aber auch weitere eigene Projekte.

## Checkliste für den Go-Live

Reihenfolge einhalten. `example.de` steht für die eigene Domain,
`203.0.113.10` für die IP des Servers. Die App läuft dann unter
`app.example.de`.

### 1. Vorab entscheiden

- [ ] **Domain** festlegen. Frei waren am 21.10.2026 zum Beispiel
      `vereintapp.de` und `vereintapp.com`.
- [ ] **Server:** Strato VPS L, 12 Monate Laufzeit, Ubuntu 24.04 LTS.
- [ ] **Backup-Ziel:** Strato HiDrive mit Protokoll-Paket (SFTP). Optional
      holt sich die NAS jeden Morgen eine Kopie
      ([nas-kopie.md](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/nas-kopie.md)).

### 2. Bei Strato bestellen

- [ ] Unter [strato.de/server/vps](https://www.strato.de/server/vps/) den
      **VPS L** mit **Ubuntu 24.04 LTS** bestellen.
- [ ] Domain dazu bestellen (oder bei einem anderen Anbieter, dann dort das
      DNS pflegen).
- [ ] HiDrive mit Protokoll-Paket bestellen, den HiDrive-Benutzernamen notieren.
- [ ] Im Kunden-Login **IPv4-Adresse** und **root-Passwort** des Servers notieren.
- [ ] Im Kunden-Login den **Auftragsverarbeitungsvertrag (AVV)** abschließen.
      Pflicht, sobald Daten anderer Menschen auf dem Server liegen; er deckt
      auch HiDrive ab.

### 3. DNS setzen

- [ ] Im DNS der Domain einen Wildcard-**A-Record** `*` → `203.0.113.10`
      anlegen. Das deckt `app`, `vereint-admin` und die Plattform-Adressen
      (`auth`, `oauth`, `traefik`, `grafana`, `status`, `analytics`) ab.
      Alternativ jede dieser Subdomains einzeln.
- [ ] Keine AAAA-Records (IPv6), solange IPv6 auf dem Server nicht getestet ist.
- [ ] Prüfen: `nslookup app.example.de` liefert die IP. Das kann bis zu einer
      Stunde dauern. **Ohne DNS bekommt Traefik keine Zertifikate.**

### 4. Server mit LinuxServerSetup einrichten

Die Schritte 1 bis 7 der
[Einrichtung in LinuxServerSetup](https://github.com/damaurer/LinuxServerSetup#einrichtung)
durchgehen: Werkzeuge, eigener SSH-Key, `ssh-copy-id root@203.0.113.10`,
`hosts.yml`, `main.yml` (`domain`, `letsencrypt_email`, `admin_email`,
`admin_ssh_public_keys`), Vault, `bootstrap.yml`. Bevor `site.yml` läuft,
zusätzlich für Vereint:

- [ ] In `inventory/group_vars/all/main.yml`:
      - `vereint_host: "app.{{ domain }}"`
      - `hidrive_user: "<HiDrive-Benutzername>"`
      - `vereint_signup_enabled: false` lassen (siehe Schritt 9)
- [ ] Im Vault (`ansible-vault edit inventory/group_vars/all/vault.yml`) den
      Abschnitt Vereint aus `vault.example.yml` übernehmen und füllen:
      - je `openssl rand -hex 32` für `vault_vereint_postgres_password`,
        `vault_vereint_keycloak_db_password`, `vault_vereint_db_password`,
        `vault_vereint_keycloak_admin_password`,
        `vault_vereint_keycloak_client_secret`,
        `vault_vereint_keycloak_tablet_client_secret`,
        `vault_vereint_keycloak_registration_client_secret`,
        `vault_vereint_session_secret`
      - `openssl rand -base64 32` für `vault_vereint_data_encryption_key`
      - Web Push: Schlüsselpaar wie in
        [docs/vereint.md](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/vereint.md#einrichten)
        erzeugen und als `vault_vereint_vapid_public_key` und
        `vault_vereint_vapid_private_key` eintragen. Ohne sie läuft Vereint
        ohne Push.
- [ ] `ansible-playbook playbooks/site.yml --ask-vault-pass` ausführen. Die
      Rolle bricht ab, wenn ein Vereint-Secret fehlt oder kürzer als 32
      Zeichen ist.
- [ ] Danach liegt die Compose-Datei unter `/opt/stacks/apps/vereint`, es
      läuft aber noch nichts. Das erste Deployment (Schritt 10) startet die
      Container.

### 5. Plattform-Admin mit 2FA

Die Keycloak-Verwaltung von Vereint und alle Admin-Oberflächen liegen hinter
dem Login der Plattform.

- [ ] Unter `https://auth.example.de/admin` (Realm `server`) den eigenen
      Benutzer anlegen, in die Gruppe `admins` aufnehmen und beim ersten Login
      2FA einrichten (siehe README von LinuxServerSetup).
- [ ] Testen: `https://status.example.de` fragt nach dem Login und lässt
      danach durch.

### 6. Schlüssel offline sichern

- [ ] Diese Werte zusätzlich offline aufbewahren (Passwort-Manager und
      ausgedruckt):
      - **Vault-Passwort** (ohne es lässt sich `vault.yml` nicht mehr öffnen)
      - **`vault_restic_password`** (ohne es lässt sich kein Backup
        wiederherstellen)
      - **`vault_vereint_data_encryption_key`** (ohne ihn sind Chat, Bilder und
        Videos auch aus einem intakten Backup nicht lesbar)
- [ ] Die verschlüsselte `vault.yml` gehört ins LinuxServerSetup-Repo, das
      Vault-Passwort nie.

### 7. Backups nach HiDrive

- [ ] `ansible-playbook playbooks/site.yml --tags backup --ask-vault-pass`.
      Der Lauf zeigt den öffentlichen SSH-Key des Servers.
- [ ] Diesen Key in HiDrive als SSH-Key hinterlegen.
- [ ] Testen: `sudo systemctl start backup.service && journalctl -u backup -f`
      endet ohne Fehler, `sudo restic-env snapshots` zeigt einen Stand.

Gesichert werden `/opt/stacks` (Konfiguration), das Volume `vereint_files`
(Bilder und Videos) und die Dumps unter `/var/backups/db`, auch der Dump vor
dem letzten Deployment. Das Datenbank-Volume selbst wird nicht gesichert,
dafür der Dump. Im schlimmsten Fall gehen die Änderungen seit 03:00 bzw. seit
dem letzten Deployment verloren.

### 8. Deploy-Zugang und GitHub

- [ ] Deploy-Key erzeugen (auf dem eigenen Rechner):
      `ssh-keygen -t ed25519 -N "" -C "deploy vereint" -f deploy_vereint`
- [ ] Inhalt von `deploy_vereint.pub` in `main.yml` unter
      `deploy_ssh_public_keys` eintragen und
      `ansible-playbook playbooks/site.yml --tags apps --ask-vault-pass`
      ausführen. Der Key darf auf dem Server nur `deploy <app> <tag>` und
      `status <app>`, keine Shell.
- [ ] Solange die Images unter `ghcr.io/damaurer/*` privat sind: unter GitHub
      *Settings → Developer settings* ein Token (classic) nur mit
      `read:packages` anlegen und als `vault_ghcr_token` in den Vault. Sind
      die drei Pakete öffentlich ([Open Source](open-source.md)), ist das
      nicht nötig.
- [ ] Im Vereint-Repo unter *Settings → Environments* das Environment
      **`production`** anlegen, nur `main` erlauben (optional
      *Required reviewers*: sich selbst). Darin als **Secrets**:
      - `DEPLOY_HOST` = `203.0.113.10`
      - `DEPLOY_SSH_KEY` = kompletter Inhalt von `deploy_vereint` (privater
        Schlüssel mit den Zeilen `-----BEGIN` und `-----END`)
      - `DEPLOY_KNOWN_HOSTS` = Ausgabe von `ssh-keyscan -t ed25519 203.0.113.10`
- [ ] Unter *Settings → Secrets and variables → Actions → Variables* die
      **Repository-Variable** `APP_NAME` = `vereint` anlegen. Sie muss im
      Repository stehen, nicht im Environment, weil GitHub sie schon vor dem
      Start des Jobs auswertet.
- [ ] Die Datei `deploy_vereint` vom eigenen Rechner löschen. Geht sie
      verloren, neu erzeugen und diesen Schritt wiederholen.
- [ ] Branch-Schutz für `main`, `qs` und `develop`: Pull Request vor dem
      Merge, CI als Pflicht, kein Force-Push.
- [ ] GitHub Actions müssen laufen. Im Oktober war das Kontingent
      aufgebraucht; mit öffentlichem Repository sind die Standard-Runner
      kostenlos, sonst erneuert es sich am 1. November.

### 9. Rechtliches vor dem Öffnen für andere

- [ ] AVV mit Strato abgeschlossen (Schritt 2).
- [ ] Platzhalter in `webservice/src/app/legal/legal-operator.ts` ausfüllen
      (Name, Anschrift, Kontakt), siehe [Rechtliches](../domains/rechtliches.md).
- [ ] Datenschutzerklärung erstellen; sie nennt Strato (Server und HiDrive)
      als Auftragsverarbeiter. Bausteine liefert die
      [DSGVO-Checkliste](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/dsgvo-checkliste.md)
      von LinuxServerSetup.
- [ ] Erst danach `vereint_signup_enabled: true` setzen und
      `site.yml --tags vereint` ausführen. Bis dahin kann niemand selbst
      Gruppen eröffnen; Einladungslinks funktionieren trotzdem.

### 10. Ausrollen

- [ ] `develop` nach `main` mergen (gern über `qs`). Die Image-Workflows
      starten von selbst, danach *Deployment (Produktion)* mit dem Job
      *Auf den eigenen Server ausrollen*.
- [ ] Gibt es auf `main` noch keine Images: unter *Actions* die Workflows
      `baseservice CI/CD`, `webservice CI/CD` und `keycloak CI/CD` je einmal
      mit *Run workflow* auf `main` starten, danach *Deployment (Produktion)*.
- [ ] Im Log muss am Ende `Deploy release-… erfolgreich` stehen. Beim ersten
      Mal braucht Keycloak ein bis zwei Minuten für den Realm-Import.
- [ ] `https://app.example.de` öffnen.

### 11. Ersten Administrator anlegen

- [ ] `https://vereint-admin.example.de/kc/admin` öffnen, zuerst mit dem
      Plattform-Login (Schritt 5) anmelden, dann in Keycloak mit `admin` und
      `vault_vereint_keycloak_admin_password`.
- [ ] Im Realm `vereint` den eigenen Benutzer anlegen, Passwort setzen
      (*Temporary* an) und die Realmrolle `admin` zuweisen. Details:
      [deploy/README.md](../../deploy/README.md#ersten-administrator-anlegen).
- [ ] In der App anmelden. Man wird Admin der Gruppe „Meine Gruppe“ und
      benennt sie unter *Gruppeneinstellungen* um.
- [ ] Gegenprobe: `https://app.example.de/kc/admin` zeigt nicht die
      Keycloak-Verwaltung (Traefik leitet den Pfad an die App weiter).

### 12. Prüfen

- [ ] Einladungslink erzeugen und mit einem zweiten Konto testen.
- [ ] Am Handy: Barcode-Kamera, Web Push, ein Bild und ein kurzes Video in
      Moments.
- [ ] Thekentablet einrichten, Kiosk-Modus starten und über
      *Vorstand → Kiosk-Geräte* entsperren.
- [ ] Ein zweites Deployment auslösen (*Actions → Deployment (Produktion) →
      Run workflow*). Danach liegt
      `/var/backups/db/vereint-vereint-db-1.pre-deploy.sql.gz` auf dem Server.
- [ ] Am nächsten Morgen: `sudo restic-env snapshots` zeigt den Stand von
      03:00.
- [ ] Eine Wiederherstellung einmal ausprobieren (siehe unten), danach
      einmal im Quartal.

### 13. Überwachung

- [ ] In Uptime Kuma (`https://status.example.de`) einen HTTP-Monitor auf
      `https://app.example.de/api/v1/health` anlegen und eine
      Benachrichtigung (z. B. E-Mail) einrichten.
- [ ] In `main.yml` `alert_email_to` setzen, damit Alarme der Plattform
      (Backup fehlgeschlagen, Platte voll, Container in Neustart-Schleife)
      ankommen.

## Im Betrieb

| Was | Wie |
| :--- | :--- |
| Sicherheitsupdates | automatisch, Neustart bei Bedarf um 04:30; die Container starten danach von selbst |
| Neue Version | Merge nach `main`: Release-Tag, Dump der Datenbank, Rollout, bei Fehler zurück zum vorherigen Tag |
| Zurückrollen | *Actions → Deployment (Produktion) → Run workflow*, im Feld *tag* einen früheren `release-…` eintragen. Die Tags stehen in der Zusammenfassung früherer Läufe und unter *Packages* |
| Wert ändern (z. B. Signup) | `main.yml` oder Vault ändern, `site.yml --tags vereint`; die Container starten mit den neuen Werten neu |
| Zustand und Logs | `cd /opt/stacks/apps/vereint && sudo docker compose ps`, `sudo docker compose logs -f --tail 100 vereint-api`, `journalctl -t app-deploy`, oder Grafana |
| Datenbank zurückholen | aus dem Dump vor dem letzten Deployment oder aus restic, siehe [docs/vereint.md](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/vereint.md#betrieb) |
| Schlüssel rotieren | ebenda unter *Schlüssel rotieren* |
| Speicherplatz | Grafana zeigt die Platte, Alarm ab 85 %; Videos sind der größte Posten |

Datenbankänderungen (Liquibase) gehen beim Zurückrollen nicht automatisch
rückwärts. Passt eine ältere Version nicht zur neueren Datenbank, die
Datenbank aus dem Dump vor dem Deployment zurückholen.

### Server komplett verloren

1. Neuen VPS bestellen, DNS auf die neue IP umstellen.
2. LinuxServerSetup mit derselben `vault.yml` und `main.yml` erneut ausrollen
   (`bootstrap.yml`, dann `site.yml`), den neuen HiDrive-Key hinterlegen.
3. In GitHub `DEPLOY_HOST` und `DEPLOY_KNOWN_HOSTS` anpassen und den letzten
   `release-…` ausrollen (*Run workflow* mit *tag*).
4. Aus restic die Dumps und das Volume `vereint_files` zurückholen und den
   Dump einspielen, siehe
   [docs/vereint.md](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/vereint.md#betrieb).
