# AWS-Infrastruktur und Kosten

Die gesamte Infrastruktur ist Terraform-Code in
[`infra/aws/`](../../infra/aws/).
Ziel: günstig, sicher und ohne Datenverlust.

## Was angelegt wird

| Baustein | Zweck |
| :--- | :--- |
| EC2 `t4g.small` (2 vCPU, 2 GB RAM, ARM) in Frankfurt (`eu-central-1`) | Ein Server für den gesamten Docker-Stack |
| Elastic IP | Feste Adresse für den DNS-Eintrag der Subdomain |
| System-Disk 20 GB und eigenes Datenvolume 10 GB (gp3, verschlüsselt) | Betriebssystem bzw. Datenbanken |
| Tägliche Snapshots des Datenvolumes, 7 Tage | Schnelle Wiederherstellung der Disk |
| S3-Bucket `vereint-backups-<account>` | Nächtliche, verschlüsselte Datenbank-Dumps (30 Tage), Deployment-Bundles |
| S3-Bucket `vereint-app-<account>` | Bilder der App |
| SSM Parameter Store unter `/vereint/*` | Alle Secrets, von Terraform zufällig erzeugt |
| Budget-Alarm | E-Mail bei 80 % des Budgets (Ist) bzw. 100 % (Prognose) |
| Backup- und Hardware-Alarm | E-Mail, wenn 26 Stunden kein Backup kam oder die Hardware ausfällt |
| GitHub-OIDC-Rolle | Deployments ohne dauerhafte AWS-Schlüssel |

## Kosten

Stand 14.10.2026, Listenpreise `eu-central-1`:

| Posten | USD pro Monat |
| :--- | ---: |
| t4g.small | 14,02 |
| Elastic IP (öffentliche IPv4) | 3,65 |
| 30 GB gp3 | 2,86 |
| **Summe netto** | **ca. 20,50** |
| **mit 19 % MwSt.** | **ca. 25** |

Snapshots, S3 und Datenverkehr kosten bei rund 50 Mitgliedern nur Cent-Beträge.
Der Budget-Alarm steht auf **30 USD** (`monthly_budget_usd`).

Zu beachten:

- `t4g` läuft im Modus „unlimited“. Liegt die CPU dauerhaft über 20 %, kommen
  CPU-Credits dazu. Im Normalbetrieb passiert das nicht.
- Ein Savings Plan über ein Jahr senkt den Serverpreis auf etwa 9 USD.
- Neue AWS-Accounts erhalten Startguthaben für die ersten Monate.

## Einrichtung

Kurzfassung (Details in [infra/aws/README.md](../../infra/aws/README.md)):

```bash
cd infra/aws/bootstrap && terraform init && terraform apply   # einmalig: State-Bucket
cd ..
cp backend.hcl.example backend.hcl                            # State-Bucket eintragen
cp terraform.tfvars.example terraform.tfvars                  # Subdomain, E-Mail
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

Was danach von Hand folgt, steht in der [Go-Live-Checkliste](go-live-checkliste.md).

## Betrieb

- **Shell auf dem Server** nur über AWS Session Manager:
  `$(terraform output -raw shell_command)`. SSH gibt es nicht.
- **Secret rotieren:** `terraform apply -replace='random_password.secrets["<NAME>"]'`,
  danach neu ausrollen.
- **Server ersetzen:** Löschschutz aufheben, `terraform apply -replace=aws_instance.app`,
  Schutz wieder einschalten. Das Datenvolume bleibt erhalten und wird wieder
  eingehängt.
- **Keycloak-Admin-Konsole** nur per Tunnel, siehe
  [Deployment und Rollback](deployment-und-rollback.md#keycloak-verwaltung).
