#!/bin/bash
# Naechtliches Backup (systemd-Timer vereint-backup.timer) und Sicherung vor
# jedem Deployment.
#
# Ablauf je Datenbank:
#   1. pg_dump im Custom-Format
#   2. Probe-Wiederherstellung in eine temporaere Datenbank: Nur ein Dump, der
#      sich nachweislich wiederherstellen laesst, gilt als Backup.
#   3. Verschluesselung mit GnuPG (AES-256, Passphrase BACKUP_ENCRYPTION_KEY)
#   4. Ablage auf dem Server unter /srv/vereint/backups (BACKUP_LOCAL_DAYS Tage)
#   5. Kopie ausser Haus:
#        - BACKUP_REMOTE gesetzt (eigener Server, z. B. Strato): per rclone an
#          ein beliebiges Ziel (HiDrive, Storage Box, S3-kompatibel, ...),
#          Zugangsdaten in /srv/vereint/rclone.conf
#        - sonst BACKUP_BUCKET (AWS): nach s3://$BACKUP_BUCKET/postgres/...
# Liegen die Dateien im Verzeichnis des Servers (STORAGE_BACKEND=filesystem),
# spiegelt rclone sie zusaetzlich nach $BACKUP_REMOTE/files; geloeschte oder
# ersetzte Dateien wandern dort nach files-geloescht/<zeitstempel>. Sie sind
# schon von der App verschluesselt (DATA_ENCRYPTION_KEY).
#
# Erst wenn alles geklappt hat, meldet das Skript den Erfolg: an CloudWatch
# (AWS) bzw. per Aufruf von BACKUP_PING_URL (z. B. healthchecks.io). Bleibt
# die Meldung aus, schlaegt der jeweilige Dienst per E-Mail Alarm.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
set -a
# shellcheck disable=SC1091
source ./.env
set +a

: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY fehlt}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
BACKUP_BUCKET="${BACKUP_BUCKET:-}"
[ -n "$BACKUP_REMOTE" ] || [ -n "$BACKUP_BUCKET" ] ||
  { echo "Kein Ziel ausser Haus: BACKUP_REMOTE (rclone) oder BACKUP_BUCKET (S3) setzen" >&2; exit 1; }
LOCAL_DIR="${BACKUP_LOCAL_DIR:-/srv/vereint/backups}"
LOCAL_DAYS="${BACKUP_LOCAL_DAYS:-7}"
REMOTE_DAYS="${BACKUP_RETENTION_DAYS:-30}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/srv/vereint/rclone.conf}"
export RCLONE_CONFIG
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
WORK="$(mktemp -d /var/tmp/vereint-backup.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"
umask 077

pg() { docker compose exec -T postgres "$@"; }
rc() { rclone --quiet --retries 5 --low-level-retries 10 "$@"; }

for db in keycloak vereint; do
  echo "== $db"
  pg pg_dump -U postgres --format=custom --compress=6 "$db" > "$WORK/$db.dump"

  test_db="restore_check_$db"
  pg dropdb -U postgres --if-exists "$test_db"
  pg createdb -U postgres "$test_db"
  pg pg_restore -U postgres --no-owner --exit-on-error -d "$test_db" < "$WORK/$db.dump"
  tables="$(pg psql -U postgres -d "$test_db" -tAc "select count(*) from information_schema.tables where table_schema='public'")"
  pg dropdb -U postgres "$test_db"
  [ "$tables" -gt 0 ] || { echo "Probe-Wiederherstellung von $db ergab keine Tabellen" >&2; exit 1; }
  echo "Probe-Wiederherstellung ok ($tables Tabellen)"

  gpg --batch --yes --quiet --pinentry-mode loopback \
    --passphrase-fd 3 --symmetric --cipher-algo AES256 \
    --output "$WORK/$db.dump.gpg" "$WORK/$db.dump" 3<<<"$BACKUP_ENCRYPTION_KEY"
  rm -f "$WORK/$db.dump"

  key="postgres/$db/$STAMP.dump.gpg"
  mkdir -p "$LOCAL_DIR/postgres/$db"
  cp "$WORK/$db.dump.gpg" "$LOCAL_DIR/$key"
  if [ -n "$BACKUP_REMOTE" ]; then
    rc copyto "$WORK/$db.dump.gpg" "$BACKUP_REMOTE/$key"
    echo "hochgeladen: $BACKUP_REMOTE/$key"
  else
    aws s3 cp --region "${S3_REGION:?S3_REGION fehlt}" --only-show-errors --sse AES256 \
      "$WORK/$db.dump.gpg" "s3://$BACKUP_BUCKET/$key"
    echo "hochgeladen: s3://$BACKUP_BUCKET/$key"
  fi
done

if [ "${STORAGE_BACKEND:-}" = filesystem ] && [ -d /srv/vereint/data/files ]; then
  [ -n "$BACKUP_REMOTE" ] || { echo "Dateien im Server-Verzeichnis brauchen BACKUP_REMOTE" >&2; exit 1; }
  echo "== Dateien"
  rc sync /srv/vereint/data/files "$BACKUP_REMOTE/files" \
    --backup-dir "$BACKUP_REMOTE/files-geloescht/$STAMP" --exclude '.upload-*'
  echo "gespiegelt: $BACKUP_REMOTE/files"
fi

# Aufraeumen erst nach einem erfolgreichen Lauf: Das neueste Backup bleibt
# also immer erhalten, auch wenn Backups laenger ausfallen.
find "$LOCAL_DIR/postgres" -type f -name '*.dump.gpg' -mtime +"$LOCAL_DAYS" -delete
if [ -n "$BACKUP_REMOTE" ]; then
  rc delete --min-age "${REMOTE_DAYS}d" "$BACKUP_REMOTE/postgres"
  # Verschobene Dateien behalten ihr altes Aenderungsdatum; deshalb nach dem
  # Zeitstempel im Ordnernamen aufraeumen, nicht mit --min-age.
  cutoff="$(date -u -d "-$REMOTE_DAYS days" +%Y-%m-%dT%H%M%SZ)"
  { rc lsf --dirs-only "$BACKUP_REMOTE/files-geloescht" 2>/dev/null || true; } | while IFS= read -r dir; do
    dir="${dir%/}"
    if [[ "$dir" =~ ^[0-9T:Z-]+$ && "$dir" < "$cutoff" ]]; then
      rc purge "$BACKUP_REMOTE/files-geloescht/$dir"
    fi
  done
fi

if [ -n "${BACKUP_PING_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 -o /dev/null "$BACKUP_PING_URL" || echo "WARNUNG: BACKUP_PING_URL nicht erreichbar" >&2
fi
if [ -z "$BACKUP_REMOTE" ]; then
  aws cloudwatch put-metric-data --region "$S3_REGION" \
    --namespace Vereint --metric-name BackupSucceeded --value 1 --unit Count
fi
echo "Backup $STAMP erfolgreich."
