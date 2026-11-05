# Betrieb auf einem Strato VPS

Vereint läuft unter **`https://vereint.maurercloud.de`** auf dem Strato VPS,
den [LinuxServerSetup](https://github.com/damaurer/LinuxServerSetup) per
Ansible einrichtet. Dieses Repo liefert die Images und die Pipeline,
LinuxServerSetup den Server: Härtung, Traefik mit HTTPS, Keycloak, Admin-Login
mit 2FA, Monitoring, Backups nach HiDrive und den Deploy-Zugang. Vereint ist
dort eine eigene Rolle (`vereint`), beschrieben in
[docs/vereint.md](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/vereint.md).

Diese Seite ist zugleich die Checkliste für den ersten Go-Live. Die
AWS-Variante ([AWS und Kosten](aws-und-kosten.md), [`deploy/`](../../deploy/))
bleibt im Repository. Welches Ziel ausgerollt wird, entscheidet die
Repository-Variable `APP_NAME` (gesetzt: eigener Server, leer: AWS).

## Der Plan

```text
GitHub Actions ──SSH: „deploy vereint release-<commit>“──▶ Strato VPS XL
                                                           /opt/stacks/apps/vereint
Internet ──443──▶ Traefik ─┬─ vereint.maurercloud.de ──▶ vereint-web ──▶ vereint-api ──▶ vereint-db
                           │                                               │   (pgvector)  Volume files
                           └─ auth.maurercloud.de/realms/vereint ──▶ Keycloak der Plattform
                                                                    (Realm „vereint“, eigenes Theme)
              stündlich/nachts: Dumps und Volumes ──restic──▶ HiDrive
```

| Thema | AWS (bisher geplant) | Strato mit LinuxServerSetup |
| :--- | :--- | :--- |
| Server | EC2 `t4g.small`, Terraform | VPS XL der Plattform, Ansible (`site.yml`) |
| HTTPS | Caddy | Traefik der Plattform, Let's Encrypt |
| Login | eigener Keycloak unter `/kc` | Keycloak der Plattform, eigener Realm `vereint` unter `auth.maurercloud.de` |
| Datenbank | PostgreSQL 17 | PostgreSQL 17 mit pgvector (`pgvector/pgvector:0.8.7-pg17`) |
| Secrets | SSM Parameter Store | Ansible Vault (`vault_vereint_*`), auf dem Server nur in Dateien für root |
| Bilder und Videos | S3-Bucket | Docker-Volume `vereint_files` (`STORAGE_BACKEND=filesystem`), von der App verschlüsselt |
| Deployment | OIDC und Systems Manager | SSH als Benutzer `deploy`, dessen Key nur `deploy vereint <tag>` darf |
| Datenbank-Backup | `pg_dump` nach S3 | `pg_dumpall` vor jedem Deployment, stündlich und nachts (Label `backup.postgres`) |
| Backups außer Haus | S3 (versioniert) | restic nach HiDrive, Kopie auf die NAS |
| Keycloak-Verwaltung | Session-Manager-Tunnel | `https://auth.maurercloud.de/admin` nach Admin-Login mit 2FA |
| Überwachung | CloudWatch | Grafana, Alertmanager und Uptime Kuma der Plattform |

Gleich bleiben Health Checks mit automatischem Rollback, die Verschlüsselung
von Chat, Bildern und Videos in der App und die Trennung der Gruppen per
Row-Level-Security.

### Was der Code dafür kann

- **Dateien ohne S3:** `STORAGE_BACKEND=filesystem` legt Bilder und Videos in
  ein Verzeichnis (Schreiben atomar, Pfade gegen Ausbruch geprüft). Die Inhalte
  sind wie bisher mit `DATA_ENCRYPTION_KEY` verschlüsselt.
- **Keycloak auf eigenem Host:** API und BFF lesen die Adresse von Keycloak nur
  aus `KEYCLOAK_ISSUER_URI`. Der Link zur Zwei-Faktor-Einrichtung im Profil
  geht über `/api/auth/account-security`, der BFF leitet zur
  Kontoverwaltung des Realms weiter.
- **Gemeinsamer Release-Tag:** Die Image-Workflows bauen nur, was sich
  geändert hat. Der Job `server` in
  [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) friert
  deshalb den Stand `:main` von baseservice und webservice als
  `release-<12 Zeichen Commit>` ein und rollt genau diesen Tag aus. Das
  Keycloak-Image dieses Repos braucht der Server nicht.
- **Realm und Login-Theme** liegen als Kopie in LinuxServerSetup
  (`ansible/roles/keycloak/templates/realms/vereint-realm.json.j2` und
  `files/themes/vereint`). Wer `keycloak/realm-export.json` oder
  `keycloak/themes/vereint` ändert, zieht die Änderung dort nach. Der Realm
  wird nur beim ersten Start angelegt; danach ändert man ihn in der
  Admin-Konsole.

## Checkliste für den Go-Live

Voraussetzung: Der Server ist nach der
[Schritt-für-Schritt-Anleitung von LinuxServerSetup](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/anleitung-einrichtung.md)
eingerichtet (Teil A bis F): `domain: maurercloud.de`, Keycloak unter
`https://auth.maurercloud.de` mit deinem Admin-Login und 2FA, Backups nach
HiDrive laufen. `203.0.113.10` steht unten für die IP des Servers.

### 1. DNS

- [ ] `vereint.maurercloud.de` zeigt auf den Server. Der Wildcard-Eintrag `*`
      aus Teil A2 deckt das ab, sonst einen A-Record `vereint` anlegen.
- [ ] Prüfen: `nslookup vereint.maurercloud.de` liefert die IP.

### 2. Einstellungen in LinuxServerSetup

- [ ] In `inventory/group_vars/all/main.yml`:
      - `vereint_host: "vereint.{{ domain }}"`
      - `vereint_signup_enabled: false` lassen (siehe Schritt 6)
- [ ] Im Vault (`EDITOR=nano ansible-vault edit inventory/group_vars/all/vault.yml`)
      den Abschnitt Vereint aus `vault.example.yml` übernehmen und füllen:
      - je `openssl rand -hex 32` für `vault_vereint_postgres_password`,
        `vault_vereint_db_password`, `vault_vereint_keycloak_client_secret`,
        `vault_vereint_keycloak_tablet_client_secret`,
        `vault_vereint_keycloak_registration_client_secret`,
        `vault_vereint_session_secret`
      - `openssl rand -base64 32` für `vault_vereint_data_encryption_key`
      - Web Push: Schlüsselpaar wie in
        [docs/vereint.md](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/vereint.md#einrichten)
        erzeugen und als `vault_vereint_vapid_public_key` und
        `vault_vereint_vapid_private_key` eintragen. Ohne sie läuft Vereint
        ohne Push.
- [ ] Deploy-Key erzeugen (auf dem eigenen Rechner):
      `ssh-keygen -t ed25519 -N "" -C "deploy vereint" -f deploy_vereint`
      und in `main.yml` eintragen:

      ```yaml
      deploy_ssh_public_keys:
        - app: vereint
          key: "ssh-ed25519 AAAA... deploy vereint"
      ```

- [ ] Solange die Images unter `ghcr.io/damaurer/*` privat sind: ein Token
      (classic) nur mit `read:packages` als `vault_ghcr_token` (Teil G der
      Anleitung). Sind baseservice und webservice öffentlich
      ([Open Source](open-source.md)), ist das nicht nötig.
- [ ] `ansible-playbook playbooks/site.yml --tags platform,apps --ask-vault-pass`.
      Die Rolle bricht ab, wenn ein Vereint-Secret fehlt oder kürzer als 32
      Zeichen ist. Keycloak startet dabei neu und legt den Realm `vereint` an.
- [ ] Prüfen: `https://auth.maurercloud.de/realms/vereint/account` zeigt die
      Anmeldeseite im Vereint-Design.
- [ ] Unter `/opt/stacks/apps/vereint` liegt die Compose-Datei, es läuft aber
      noch nichts. Das erste Deployment (Schritt 7) startet die Container.

### 3. Schlüssel offline sichern

- [ ] **`vault_vereint_data_encryption_key`** zusätzlich offline aufbewahren
      (Passwort-Manager und ausgedruckt), neben Vault-Passwort und
      `vault_restic_password`. Ohne ihn sind Chat, Bilder und Videos auch aus
      einem intakten Backup nicht lesbar.

### 4. GitHub einrichten

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
      verloren, neu erzeugen und Schritt 2 und 4 wiederholen.
- [ ] Branch-Schutz für `main`, `qs` und `develop`: Pull Request vor dem
      Merge, CI als Pflicht, kein Force-Push.
- [ ] GitHub Actions müssen laufen: mit öffentlichem Repository sind die
      Standard-Runner kostenlos, sonst gilt das monatliche Kontingent.

### 5. Ersten Administrator anlegen

- [ ] `https://auth.maurercloud.de/admin` öffnen: erst Admin-Login der
      Plattform (Realm `server`, 2FA), dann Login im Realm `master`.
- [ ] Links oben den Realm **`vereint`** wählen, *Users → Add user*, Passwort
      setzen (*Temporary* an) und unter *Role mapping* die Realm-Rolle
      `admin` zuweisen. Details:
      [deploy/README.md](../../deploy/README.md#ersten-administrator-anlegen).

### 6. Rechtliches vor dem Öffnen für andere

- [ ] AV-Vertrag mit Strato abgeschlossen (README von LinuxServerSetup).
- [ ] Platzhalter in `webservice/src/app/legal/legal-operator.ts` ausfüllen
      (Name, Anschrift, Kontakt), siehe [Rechtliches](../domains/rechtliches.md).
- [ ] Datenschutzerklärung erstellen; sie nennt Strato (Server und HiDrive)
      als Auftragsverarbeiter. Bausteine liefert die
      [DSGVO-Checkliste](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/dsgvo-checkliste.md).
- [ ] Erst danach `vereint_signup_enabled: true` setzen und
      `site.yml --tags vereint` ausführen. Bis dahin kann niemand selbst
      Gruppen eröffnen; Einladungslinks funktionieren trotzdem.

### 7. Ausrollen

- [ ] `develop` nach `main` mergen (gern über `qs`). Die Image-Workflows
      starten von selbst, danach *Deployment (Produktion)* mit dem Job
      *Auf den eigenen Server ausrollen*.
- [ ] Gibt es auf `main` noch keine Images: unter *Actions* die Workflows
      `baseservice CI/CD` und `webservice CI/CD` je einmal mit *Run workflow*
      auf `main` starten, danach *Deployment (Produktion)*.
- [ ] Im Log muss am Ende `Deploy release-… erfolgreich` stehen.
- [ ] `https://vereint.maurercloud.de` öffnen und mit dem Administrator aus
      Schritt 5 anmelden. Man wird Admin der Gruppe „Meine Gruppe“ und benennt
      sie unter *Gruppeneinstellungen* um.

### 8. Prüfen

- [ ] Einladungslink erzeugen und mit einem zweiten Konto testen (legt den
      Benutzer über die Admin-API im Realm `vereint` an).
- [ ] Profil → Zwei-Faktor-Anmeldung öffnet die Kontoverwaltung unter
      `auth.maurercloud.de`.
- [ ] Am Handy: Barcode-Kamera, Web Push, ein Bild und ein kurzes Video in
      Moments.
- [ ] Thekentablet einrichten, Kiosk-Modus starten und über
      *Vorstand → Kiosk-Geräte* entsperren.
- [ ] Ein zweites Deployment auslösen (*Actions → Deployment (Produktion) →
      Run workflow*). Danach liegt
      `/var/backups/db/vereint-vereint-db-1.pre-deploy.sql.gz` auf dem Server.
- [ ] Eine Wiederherstellung einmal ausprobieren
      ([docs/vereint.md](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/vereint.md#betrieb)),
      danach einmal im Quartal.

### 9. Überwachung

- [ ] In Uptime Kuma (`https://status.maurercloud.de`) einen HTTP-Monitor auf
      `https://vereint.maurercloud.de/api/v1/health` anlegen.

## Im Betrieb

| Was | Wie |
| :--- | :--- |
| Neue Version | Merge nach `main`: Release-Tag, Dump der Datenbank, Rollout, bei Fehler zurück zum vorherigen Tag |
| Zurückrollen | *Actions → Deployment (Produktion) → Run workflow*, im Feld *tag* einen früheren `release-…` eintragen. Die Tags stehen in der Zusammenfassung früherer Läufe und unter *Packages* |
| Wert ändern (z. B. Signup) | `main.yml` oder Vault ändern, `site.yml --tags vereint`; die Container starten mit den neuen Werten neu |
| Benutzer und Rollen | `https://auth.maurercloud.de/admin`, Realm `vereint` |
| Zustand und Logs | `cd /opt/stacks/apps/vereint && sudo docker compose ps`, `sudo docker compose logs -f --tail 100 vereint-api`, `journalctl -t app-deploy`, oder Grafana |
| Datenbank zurückholen | aus dem Dump vor dem letzten Deployment oder aus restic, siehe [docs/vereint.md](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/vereint.md#betrieb) |
| Schlüssel rotieren | ebenda unter *Schlüssel rotieren* |

Datenbankänderungen (Liquibase) gehen beim Zurückrollen nicht automatisch
rückwärts. Passt eine ältere Version nicht zur neueren Datenbank, die
Datenbank aus dem Dump vor dem Deployment zurückholen.

Fällt der ganze Server aus, gilt die
[Notfall-Anleitung von LinuxServerSetup](https://github.com/damaurer/LinuxServerSetup/blob/master/docs/notfall-wiederherstellung.md);
danach in GitHub `DEPLOY_HOST` und `DEPLOY_KNOWN_HOSTS` anpassen und den
letzten `release-…` ausrollen.
