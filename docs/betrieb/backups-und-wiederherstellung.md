# Backups und Wiederherstellung

> **Strato / eigener Server:** Dort übernimmt [LinuxServerSetup](https://github.com/damaurer/LinuxServerSetup) die Backups (Dump vor jedem Deployment, nachts restic nach HiDrive), siehe
> [Betrieb auf einem Strato VPS](strato.md). Diese Seite beschreibt den Weg über AWS.

Datenverlust soll praktisch ausgeschlossen sein. Dafür gibt es mehrere
unabhängige Sicherungen.

## Was gesichert wird

| Sicherung | Wann | Aufbewahrung |
| :--- | :--- | :--- |
| `pg_dump` beider Datenbanken (`vereint`, `keycloak`), probeweise wiederhergestellt, verschlüsselt, nach S3 | täglich 01:30 UTC | 30 Tage |
| Dasselbe direkt vor jedem Deployment | bei jedem Deployment | 30 Tage |
| Snapshot des gesamten Datenvolumes | täglich 02:30 UTC | 7 Tage |
| Bilder, Fotos und Videos aus Moments | liegen in S3, verschlüsselt | – |

Ablauf des nächtlichen Backups (`bin/backup.sh`, systemd-Timer):

1. `pg_dump` beider Datenbanken.
2. **Probe-Wiederherstellung** jedes Dumps in eine temporäre Datenbank. Nur was
   sich nachweislich wiederherstellen lässt, wird hochgeladen.
3. Verschlüsselung mit `BACKUP_ENCRYPTION_KEY`, Upload nach
   `s3://vereint-backups-<account>/postgres/<db>/<zeitstempel>.dump.gpg`.
4. Erfolgsmeldung an CloudWatch. Bleibt sie über 26 Stunden aus, kommt eine
   E-Mail.

Schutz der Backups selbst:

- Der Server darf in den Backup-Bucket schreiben, aber **nichts löschen**. Mit
  der Versionierung kann selbst ein kompromittierter Server vorhandene Backups
  nicht zerstören.
- Das Datenvolume ist eine eigene Disk, die einen Austausch des Servers überlebt
  und die Terraform nicht löschen kann.
- Löschschutz für Server und Buckets.

## Wiederherstellen

| Situation | Weg |
| :--- | :--- |
| Daten versehentlich gelöscht oder Datenbank kaputt | `sudo /srv/vereint/app/bin/restore.sh vereint` (oder `keycloak`), optional mit dem S3-Key eines älteren Backups |
| Deployment hat die Daten beschädigt | dasselbe; ohne Angabe nimmt `restore.sh` das neueste Backup, also das von direkt vor dem Deployment |
| Datenvolume verloren | Aus dem Snapshot ein neues Volume erstellen und mit `terraform import aws_ebs_volume.data <vol-id>` übernehmen ([infra/aws/README.md](../../infra/aws/README.md#betrieb)) |
| Server komplett verloren | `terraform apply` legt ihn neu an, das Datenvolume bleibt erhalten |

`restore.sh` fragt vor dem Überschreiben den Datenbanknamen zur Bestätigung ab
und stoppt den betroffenen Dienst währenddessen.

> Ohne `BACKUP_ENCRYPTION_KEY` lässt sich kein S3-Backup lesen, ohne
> `DATA_ENCRYPTION_KEY` bleiben Nachrichten, Bilder und Videos auch nach einem Restore
> unlesbar. Beide offline sichern, siehe
> [Sicherheit und Verschlüsselung](sicherheit-und-schluessel.md#schlüssel-die-offline-gesichert-sein-müssen).

Mehr: [deploy/README.md](../../deploy/README.md#backups)
