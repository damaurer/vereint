# Go-Live-Checkliste

Der Code für Infrastruktur, Deployment und Backups ist fertig. Diese Schritte
muss eine Person mit AWS- und GitHub-Admin-Zugang einmalig von Hand machen. Bis
dahin ist in AWS noch nichts angelegt.

## 1. Infrastruktur anlegen

- [ ] AWS-Account mit Admin-Zugang, AWS CLI und Terraform ≥ 1.10 bereit.
- [ ] In `infra/aws` einmalig `bootstrap` ausführen (State-Bucket), dann
      `backend.hcl` und `terraform.tfvars` (Subdomain, Alarm-E-Mail) anlegen.
- [ ] `terraform init -backend-config=backend.hcl`, `terraform plan`,
      `terraform apply`.

Details: [AWS-Infrastruktur und Kosten](AWS-Infrastruktur-und-Kosten#einrichtung)

## 2. DNS und Alarme

- [ ] Für die Subdomain einen `A`-Record auf `terraform output public_ip`
      anlegen. Caddy holt das HTTPS-Zertifikat danach selbst.
- [ ] Die Bestätigungs-Mails von AWS an die Alarm-Adresse bestätigen (Budget und
      Betrieb). Bis zum ersten nächtlichen Backup meldet der Backup-Alarm einmal
      „ALARM“, das ist normal.

## 3. GitHub einrichten

- [ ] Unter *Settings → Environments* ein Environment **`production`** anlegen
      (empfohlen: nur Branch `main`, optional mit Freigabe).
- [ ] Secret `AWS_DEPLOY_ROLE_ARN` = Ausgabe von
      `terraform output -raw deploy_role_arn`.
- [ ] Variablen `AWS_REGION`, `VEREINT_INSTANCE_ID` und `VEREINT_DEPLOY_BUCKET`
      aus `terraform output github_environment_variables`.

## 4. Schlüssel offline sichern

- [ ] `/vereint/BACKUP_ENCRYPTION_KEY` und `/vereint/DATA_ENCRYPTION_KEY` aus
      dem Parameter Store auslesen und offline aufbewahren (Passwort-Manager).
      Siehe [Sicherheit und Verschlüsselung](Sicherheit-und-Verschluesselung#schlüssel-die-offline-gesichert-sein-müssen).

## 5. Erstes Deployment

- [ ] `develop` nach `main` mergen (gern über `qs`).
- [ ] Gibt es auf `main` noch keine Images: unter *Actions* `baseservice CI/CD`,
      `webservice CI/CD` und `keycloak CI/CD` je einmal mit *Run workflow* auf
      `main` starten. Danach rollt `Deployment (Produktion)` von selbst aus.
- [ ] Im Browser `https://<subdomain>` öffnen und anmelden.

## 6. Nur falls der Realm schon vorher importiert wurde

Keycloak importiert `realm-export.json` nur, wenn es den Realm noch nicht gibt.
Wurde der Realm angelegt, bevor es Einladungslinks gab, den Client einmal von
Hand ergänzen:

- [ ] `terraform apply` (legt `/vereint/KEYCLOAK_REGISTRATION_CLIENT_SECRET` an).
- [ ] In der [Keycloak-Admin-Konsole](Deployment-und-Rollback#keycloak-verwaltung)
      im Realm `vereint` den Client `vereint-registration` anlegen:
      *Client authentication* an, nur *Service accounts roles*, Secret = Wert aus
      dem Parameter Store.
- [ ] Dem Service-Account die Client-Rolle `realm-management` / `manage-users`
      zuweisen, sonst nichts.
- [ ] Neu ausrollen.

Bei einer frischen Installation entfällt dieser Schritt.

## 7. Nach dem Go-Live prüfen

- [ ] Ersten Admin anlegen bzw. anmelden, Rollen vergeben, Einladungslink testen.
- [ ] Web Push auf einem Handy einschalten ([PWA und Push](PWA-und-Push)).
- [ ] Barcode-Scan mit der Kamera testen (geht erst unter HTTPS).
- [ ] Am nächsten Tag prüfen, dass das nächtliche Backup gelaufen ist
      (`journalctl -u vereint-backup.service`) und kein Backup-Alarm kam.
