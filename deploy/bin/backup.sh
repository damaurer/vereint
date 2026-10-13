#!/bin/bash
# Naechtliches Backup beider Datenbanken (systemd-Timer vereint-backup.timer).
#
# Ablauf je Datenbank:
#   1. pg_dump im Custom-Format
#   2. Probe-Wiederherstellung in eine temporaere Datenbank: Nur ein Dump, der
#      sich nachweislich wiederherstellen laesst, gilt als Backup.
#   3. Verschluesselung mit GnuPG (AES-256, Passphrase BACKUP_ENCRYPTION_KEY)
#   4. Upload nach s3://$BACKUP_BUCKET/postgres/<db>/<zeitstempel>.dump.gpg
# Erst wenn alles geklappt hat, meldet das Skript den Erfolg an CloudWatch.
# Bleibt diese Meldung aus, verschickt ein Alarm eine E-Mail.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
set -a
# shellcheck disable=SC1091
source ./.env
set +a

: "${BACKUP_BUCKET:?BACKUP_BUCKET fehlt}" "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY fehlt}"
REGION="${S3_REGION:?S3_REGION fehlt}"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
WORK="$(mktemp -d /var/tmp/vereint-backup.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"

pg() { docker compose exec -T postgres "$@"; }

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

  aws s3 cp --region "$REGION" --only-show-errors --sse AES256 \
    "$WORK/$db.dump.gpg" "s3://$BACKUP_BUCKET/postgres/$db/$STAMP.dump.gpg"
  echo "hochgeladen: s3://$BACKUP_BUCKET/postgres/$db/$STAMP.dump.gpg"
done

aws cloudwatch put-metric-data --region "$REGION" \
  --namespace Vereint --metric-name BackupSucceeded --value 1 --unit Count
echo "Backup $STAMP erfolgreich."
