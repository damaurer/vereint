# AWS-Infrastruktur (Terraform)

Günstiges, abgesichertes Hosting für Vereint auf einem einzelnen ARM-Server in
Frankfurt. Laufende Kosten: etwa **21 USD im Monat**, keine offenen Admin-Ports, keine
Daten, die an einem einzigen Ort verloren gehen können.

## Was angelegt wird

| Baustein | Zweck | Kosten (ca., eu-central-1) |
|---|---|---|
| EC2 `t4g.small` (2 vCPU, 2 GB RAM, ARM) + 2 GB Swap | Server für den gesamten Docker-Stack | ~14 USD |
| Feste IPv4 (Elastic IP) | Ziel des DNS-Eintrags der Subdomain | ~3,60 USD |
| System-Disk 20 GB + Datenvolume 10 GB (gp3, verschlüsselt) | Betriebssystem bzw. Datenbanken | ~2,90 USD |
| Tägliche Snapshots des Datenvolumes (7 Tage) | Schnelle Wiederherstellung der Disk | < 1 USD |
| S3-Bucket `vereint-backups-<account>` | Nächtliche Datenbank-Dumps (30 Tage) | Cent-Bereich |
| S3-Bucket `vereint-app-<account>` | Dateien der Anwendung (ersetzt MinIO) | Cent-Bereich |
| SSM Parameter Store | Alle Secrets, zufällig generiert | kostenlos |
| Budget-Alarm | E-Mail bei 80 % Ist- bzw. 100 % Prognosewert | kostenlos |
| GitHub-OIDC-Rolle | Deployments ohne dauerhafte AWS-Schlüssel | kostenlos |

Neue AWS-Accounts erhalten Startguthaben, das die ersten Monate deckt. Der
kostenlose 1-GB-Server reicht für Keycloak, Spring Boot, Node und zwei
PostgreSQL-Instanzen nicht aus.

## Sicherheit

- **Kein SSH.** Port 22 ist geschlossen, es gibt keinen Schlüssel. Eine Shell
  gibt es nur über AWS Session Manager (`terraform output shell_command`),
  angemeldet mit dem eigenen AWS-Login.
- **Nur 80/443 offen.** Ausgehend sind nur Web und E-Mail-Versand erlaubt.
- **IMDSv2 mit Hop-Limit 1:** Container auf dem Server kommen nicht an die
  Credentials der Server-Rolle.
- **Alles verschlüsselt:** EBS-Verschlüsselung ist für den ganzen Account
  eingeschaltet, S3 verschlüsselt serverseitig und lehnt Zugriffe ohne TLS ab.
  Beide Buckets sind privat.
- **Secrets** werden von Terraform zufällig erzeugt und als `SecureString` unter
  `/vereint/*` im Parameter Store abgelegt. Im Repository und in GitHub stehen
  sie nie. Der Terraform-State enthält sie ebenfalls und liegt deshalb
  verschlüsselt und versioniert in S3.
- **Automatische Sicherheitsupdates** des Betriebssystems über `dnf-automatic`.
- **Deployments** aus GitHub Actions per OIDC: Nur Jobs im Environment
  `production` dieses Repositories dürfen die Rolle übernehmen, und die Rolle
  darf nur Befehle auf diesem einen Server ausführen.

## Schutz vor Datenverlust

1. **Eigenes Datenvolume.** Datenbanken liegen unter `/srv/vereint` auf einer
   eigenen Disk. Sie überlebt einen Austausch des Servers, und Terraform kann sie
   nicht löschen (`prevent_destroy`). Die Erstinstallation formatiert sie nur,
   wenn sie noch leer ist.
2. **Tägliche Snapshots** dieser Disk, 7 Tage aufbewahrt.
3. **Nächtliche Dumps nach S3** (kommt mit Schritt 3). Der Server darf in den
   Backup-Bucket schreiben, aber nichts löschen. Zusammen mit der Versionierung
   kann selbst ein kompromittierter Server vorhandene Backups nicht zerstören.
4. **Automatische Wiederherstellung:** Fällt die AWS-Hardware aus, startet AWS
   den Server auf neuer Hardware neu.
5. **Löschschutz** für Server und Buckets.

## Einrichtung

Voraussetzungen: AWS-Account, [AWS CLI](https://docs.aws.amazon.com/cli/) mit
Admin-Zugang (`aws configure` bzw. `aws sso login`), Terraform ≥ 1.10.

```bash
cd infra/aws

# 1. Einmalig: Bucket für den Terraform-State anlegen
cd bootstrap
terraform init
terraform apply          # gibt state_bucket aus
cd ..

# 2. Konfiguration
cp backend.hcl.example backend.hcl          # Bucket-Namen aus Schritt 1 eintragen
cp terraform.tfvars.example terraform.tfvars # Subdomain und E-Mail eintragen

# 3. Infrastruktur anlegen
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

Danach:

1. **DNS:** Für die Subdomain einen `A`-Record auf `terraform output public_ip`
   anlegen.
2. **Budget-Mail bestätigen:** AWS schickt eine Bestätigung an `alert_email`.
3. **GitHub:** Im Repository unter *Settings → Environments* ein Environment
   `production` anlegen (optional mit erforderlicher Freigabe) und dort
   `AWS_DEPLOY_ROLE_ARN` = `terraform output deploy_role_arn` als Secret
   hinterlegen. Das brauchen die Deployments aus Schritt 4.

## Betrieb

- **Shell auf dem Server:** `$(terraform output -raw shell_command)`
  (benötigt das [Session-Manager-Plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html)).
- **Secret rotieren:**
  `terraform apply -replace='random_password.secrets["SESSION_SECRET"]'`,
  danach neu deployen.
- **Server ersetzen** (z. B. neues Betriebssystem-Image): Löschschutz per
  `termination_protection = false` aufheben,
  `terraform apply -replace=aws_instance.app`, Schutz wieder einschalten. Das
  Datenvolume wird automatisch wieder eingehängt.
- **Snapshot wiederherstellen:** Aus dem Snapshot in der EC2-Konsole ein neues
  Volume in derselben Zone erstellen und es per
  `terraform import aws_ebs_volume.data <vol-id>` (nach
  `terraform state rm aws_ebs_volume.data`) übernehmen.

## Hinweise

- `.terraform.lock.hcl` ist nicht eingecheckt. Beim ersten `terraform init` wird
  sie lokal erzeugt; danach kann sie gern committet werden.
- Der baseservice signiert Presigned URLs selbst und braucht deshalb statische
  S3-Zugangsdaten. Dafür gibt es den IAM-Benutzer `vereint-app-storage`, der nur
  den App-Bucket nutzen darf. Seine Schlüssel liegen unter
  `/vereint/S3_ACCESS_KEY` bzw. `/vereint/S3_SECRET_KEY`.
