# Backups und Wiederherstellung

Datenverlust soll praktisch ausgeschlossen sein. Dafür gibt es mehrere
unabhängige Sicherungen.

## Was gesichert wird

| Sicherung | Wann | Aufbewahrung |
| :--- | :--- | :--- |
| `pg_dump` beider Datenbanken (`vereint`, `keycloak`), probeweise wiederhergestellt, verschlüsselt, außer Haus (Strato: `BACKUP_REMOTE` per rclone, AWS: S3) | täglich 01:30 UTC | 30 Tage außer Haus, 7 Tage zusätzlich auf dem Server |
| Dasselbe direkt vor jedem Deployment | bei jedem Deployment | wie oben |
| Bilder, Fotos und Videos (Strato: `/srv/vereint/data/files`) | täglich gespiegelt nach `BACKUP_REMOTE/files`, gelöschte und ersetzte Dateien 30 Tage in `files-geloescht/` | 30 Tage |
| Bilder, Fotos und Videos (AWS) | liegen in S3, versioniert und verschlüsselt | – |
| Snapshot des gesamten Datenvolumes (nur AWS) | täglich 02:30 UTC | 7 Tage |

Ablauf des nächtlichen Backups (`bin/backup.sh`, systemd-Timer):

1. `pg_dump` beider Datenbanken.
2. **Probe-Wiederherstellung** jedes Dumps in eine temporäre Datenbank. Nur was
   sich nachweislich wiederherstellen lässt, wird hochgeladen.
3. Verschlüsselung mit `BACKUP_ENCRYPTION_KEY`, Ablage unter
   `/srv/vereint/backups/postgres/<db>/<zeitstempel>.dump.gpg` und Kopie außer
   Haus: auf einem eigenen Server per rclone nach `BACKUP_REMOTE`
   (z. B. HiDrive, Einrichtung in [Strato, Schritt 8](strato.md#8-backups-außer-haus-einrichten)),
   bei AWS nach `s3://vereint-backups-<account>/postgres/...`.
4. Eigener Server: Dateien nach `BACKUP_REMOTE/files` spiegeln.
5. Erfolgsmeldung: Aufruf von `BACKUP_PING_URL` (healthchecks.io) bzw. an
   CloudWatch. Bleibt sie aus, kommt eine E-Mail.

Schutz der Backups selbst (AWS):

- Der Server darf in den Backup-Bucket schreiben, aber **nichts löschen**. Mit
  der Versionierung kann selbst ein kompromittierter Server vorhandene Backups
  nicht zerstören.
- Das Datenvolume ist eine eigene Disk, die einen Austausch des Servers überlebt
  und die Terraform nicht löschen kann.
- Löschschutz für Server und Buckets.

Auf einem eigenen Server kann ein Angreifer mit root-Rechten die
rclone-Zugangsdaten nutzen. Wer sich dagegen absichern will, zieht ab und zu
eine Kopie von HiDrive auf den eigenen Rechner oder schaltet beim Backup-Ziel
Snapshots bzw. eine Papierkorb-Funktion ein.

## Wiederherstellen

| Situation | Weg |
| :--- | :--- |
| Daten versehentlich gelöscht oder Datenbank kaputt | `sudo /srv/vereint/app/bin/restore.sh vereint` (oder `keycloak`), optional mit dem Pfad eines älteren Backups (`postgres/vereint/<zeitstempel>.dump.gpg` bzw. S3-Key) |
| Bilder oder Videos fehlen (eigener Server) | `sudo /srv/vereint/app/bin/restore.sh files`; ältere Fassungen liegen im Backup-Ziel unter `files-geloescht/<zeitstempel>` |
| Server komplett verloren (eigener Server) | siehe [Strato, Server komplett verloren](strato.md#server-komplett-verloren) |
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
