# Go-Live-Checkliste

> **Betrieb auf Strato oder einem anderen eigenen Server:** Die vollständige
> Checkliste dafür steht in [Betrieb auf einem Strato VPS](strato.md#checkliste-für-den-go-live).
> Diese Seite beschreibt den Weg über AWS.

Stand 16.10.2026: Der Code auf `develop` ist bereit für das erste
Produktions-Deployment; alle Workflows sind grün. Auf `main` wurde noch nie
ausgerollt, und in AWS ist noch nichts angelegt. Diese Schritte muss eine Person
mit AWS- und GitHub-Admin-Zugang einmalig von Hand machen, **in dieser
Reihenfolge**.

## 1. Infrastruktur und DNS

- [ ] AWS-Account mit Admin-Zugang, AWS CLI und Terraform ≥ 1.10 bereit.
- [ ] In `infra/aws` einmalig `bootstrap` ausführen (State-Bucket), dann
      `backend.hcl` und `terraform.tfvars` (Subdomain, Alarm-E-Mail) anlegen.
- [ ] `terraform init -backend-config=backend.hcl`, `terraform plan`,
      `terraform apply`.
- [ ] Für die Subdomain einen `A`-Record auf `terraform output public_ip`
      setzen, **bevor** ausgerollt wird. Ohne DNS bekommt Caddy kein Zertifikat,
      und die Anmeldung scheitert.

Details: [AWS-Infrastruktur und Kosten](aws-und-kosten.md#einrichtung)

## 2. Alarme bestätigen

- [ ] Die zwei Bestätigungs-Mails von AWS an die Alarm-Adresse bestätigen
      (Budget und Betrieb). Bis zum ersten nächtlichen Backup meldet der
      Backup-Alarm einmal „ALARM“, das ist normal.

## 3. GitHub einrichten

- [ ] Unter *Settings → Environments* das Environment **`production`** anlegen
      und unter *Deployment branches and tags* nur `main` erlauben (optional mit
      *Required reviewers*, dann wartet jedes Deployment auf einen Klick).
- [ ] Secret `AWS_DEPLOY_ROLE_ARN` = Ausgabe von
      `terraform output -raw deploy_role_arn`.
- [ ] Variablen `AWS_REGION`, `VEREINT_INSTANCE_ID` und `VEREINT_DEPLOY_BUCKET`
      aus `terraform output github_environment_variables`.
- [ ] Branch-Schutz für `main` (sinnvoll auch für `qs` und `develop`): Pull
      Request vor dem Merge, CI-Checks als Pflicht, kein Force-Push, kein Löschen.

## 4. Schlüssel offline sichern

- [ ] `/vereint/BACKUP_ENCRYPTION_KEY` und `/vereint/DATA_ENCRYPTION_KEY` aus
      dem Parameter Store auslesen und offline aufbewahren (Passwort-Manager).
      Ohne den Daten-Schlüssel sind Chat, Bilder und Videos auch aus intakten
      Backups nicht lesbar. Siehe
      [Sicherheit und Verschlüsselung](sicherheit-und-schluessel.md#schlüssel-die-offline-gesichert-sein-müssen).

## 5. Eröffnen von Gruppen festlegen

- [ ] Eröffnen eigener Gruppen über `/gruppe-eroeffnen` ist ab Werk an. Solange
      Impressum und AGB nur Entwürfe mit Platzhaltern sind und die
      Datenschutzerklärung fehlt ([rechtliches.md](../domains/rechtliches.md)), den SSM-Parameter
      `/vereint/SIGNUP_ENABLED` mit dem Wert `false` anlegen. Einladungslinks
      funktionieren weiter.

## 6. Ausrollen

- [ ] `develop` nach `main` mergen (Fast-Forward, gern über `qs`). Die drei
      Image-Workflows starten von selbst, danach rollt `Deployment (Produktion)`
      aus. Fehlen auf `main` Images, die Workflows `baseservice CI/CD`,
      `webservice CI/CD` und `keycloak CI/CD` einmal mit *Run workflow* starten.
- [ ] Den **ersten Administrator** anlegen. Der Produktions-Realm hat keine
      Benutzer; die Anleitung steht in
      [deploy/README.md](../../deploy/README.md#ersten-administrator-anlegen).
      Er braucht nur die Realmrolle `admin` (Plattform-Admin). Meldet er sich als Erster an, wird er
      automatisch Admin der Gruppe „Meine Gruppe“
      ([Mehrere Gruppen](../../deploy/README.md#mehrere-gruppen)).

Der Keycloak-Handgriff für Einladungslinks entfällt, weil der Realm beim ersten
Start frisch importiert wird.

## 7. Nach dem ersten Deployment prüfen

- [ ] Anmelden, „Meine Gruppe“ unter *Gruppeneinstellungen* umbenennen, Rollen
      vergeben, einen Einladungslink testen.
- [ ] Barcode-Kamera und Web Push am Handy testen; beides geht erst unter echtem
      HTTPS ([PWA und Push](../frontend/angular-ssr-and-pwa.md)).
- [ ] Zwei-Faktor-Anmeldung einmal einrichten. Die OTP-Seiten kommen aus
      Keycloak 26.8.1, der Rahmen des Login-Themes aus den 26.1.4-Vorlagen.
- [ ] Ein kurzes Video in Moments hochladen.
- [ ] Thekentablet einrichten und den Kiosk-Modus einmal starten und über
      *Vorstand → Kiosk-Geräte* entsperren.
- [ ] Am nächsten Tag prüfen, dass das nächtliche Backup gelaufen ist
      (`journalctl -u vereint-backup.service`) und kein Backup-Alarm kam.

## Im Betrieb beobachten

- **Arbeitsspeicher:** Die Speichergrenzen der Container summieren sich auf etwa
  2,1 GB; der `t4g.small` hat 2 GB plus 2 GB Swap. Wird die App zäh, zuerst hier
  nachsehen (`docker stats`).
