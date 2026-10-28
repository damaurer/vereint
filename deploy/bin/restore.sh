#!/bin/bash
# Stellt eine Datenbank oder die Dateien aus einem Backup wieder her.
#
#   restore.sh <keycloak|vereint> [latest|<pfad>]
#   restore.sh files
#
# Datenbanken: `latest` nimmt das neueste Backup, zuerst auf dem Server
# (/srv/vereint/backups), sonst ausser Haus (BACKUP_REMOTE bzw. BACKUP_BUCKET).
# Alternativ ein Pfad: eine lokale Datei, ein Pfad im Ziel ausser Haus
# (postgres/<db>/<zeitstempel>.dump.gpg) oder bei AWS ein S3-Key.
# Die Ziel-Datenbank wird dabei vollstaendig ersetzt; der zugehoerige Dienst
# wird fuer die Dauer der Wiederherstellung gestoppt.
#
# Dateien (nur STORAGE_BACKEND=filesystem): holt fehlende oder abweichende
# Dateien aus $BACKUP_REMOTE/files zurueck. Vorhandene Dateien bleiben
# erhalten, es wird nichts geloescht.
set -euo pipefail

WHAT="${1:?Aufruf: restore.sh <keycloak|vereint> [latest|<pfad>] | restore.sh files}"
WHICH="${2:-latest}"

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
set -a
# shellcheck disable=SC1091
source ./.env
set +a
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
BACKUP_BUCKET="${BACKUP_BUCKET:-}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-/srv/vereint/backups}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-/srv/vereint/rclone.conf}"

confirm() {
  read -r -p "Zum Fortfahren '$1' eingeben: " answer
  [ "$answer" = "$1" ] || { echo "Abgebrochen."; exit 1; }
}

if [ "$WHAT" = files ]; then
  [ -n "$BACKUP_REMOTE" ] || { echo "BACKUP_REMOTE fehlt" >&2; exit 1; }
  echo "Hole Dateien aus $BACKUP_REMOTE/files nach /srv/vereint/data/files."
  confirm files
  rclone copy --progress "$BACKUP_REMOTE/files" /srv/vereint/data/files
  chown -R 10001:10001 /srv/vereint/data/files
  echo "Dateien wiederhergestellt."
  exit 0
fi

DB="$WHAT"
case "$DB" in
  keycloak) SERVICE=keycloak ;;
  vereint) SERVICE=baseservice ;;
  *) echo "Unbekannt: $DB (keycloak, vereint oder files)" >&2; exit 1 ;;
esac

WORK="$(mktemp -d /var/tmp/vereint-restore.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"

if [ "$WHICH" = latest ]; then
  SOURCE="$({ find "$LOCAL_DIR/postgres/$DB" -type f -name '*.dump.gpg' 2>/dev/null || true; } | sort | tail -n 1)"
  if [ -z "$SOURCE" ] && [ -n "$BACKUP_REMOTE" ]; then
    name="$(rclone lsf --files-only "$BACKUP_REMOTE/postgres/$DB" | sort | tail -n 1)"
    if [ -n "$name" ]; then SOURCE="remote:postgres/$DB/$name"; fi
  elif [ -z "$SOURCE" ] && [ -n "$BACKUP_BUCKET" ]; then
    key="$(aws s3api list-objects-v2 --region "$S3_REGION" --bucket "$BACKUP_BUCKET" --prefix "postgres/$DB/" \
      --query 'sort_by(Contents, &LastModified)[-1].Key' --output text)"
    if [ -n "$key" ] && [ "$key" != None ]; then SOURCE="remote:$key"; fi
  fi
elif [ -f "$WHICH" ]; then
  SOURCE="$WHICH"
else
  SOURCE="remote:$WHICH"
fi
[ -n "${SOURCE:-}" ] || { echo "Kein Backup fuer $DB gefunden" >&2; exit 1; }

case "$SOURCE" in
  remote:*)
    key="${SOURCE#remote:}"
    if [ -n "$BACKUP_REMOTE" ]; then
      rclone copyto "$BACKUP_REMOTE/$key" "$WORK/db.dump.gpg"
      SOURCE="$BACKUP_REMOTE/$key"
    else
      aws s3 cp --region "$S3_REGION" --only-show-errors "s3://$BACKUP_BUCKET/$key" "$WORK/db.dump.gpg"
      SOURCE="s3://$BACKUP_BUCKET/$key"
    fi
    ;;
  *) cp "$SOURCE" "$WORK/db.dump.gpg" ;;
esac

echo "Stelle $DB aus $SOURCE wieder her."
echo "Die aktuelle Datenbank $DB wird dabei ueberschrieben."
confirm "$DB"

gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --output "$WORK/db.dump" --decrypt "$WORK/db.dump.gpg" 3<<<"$BACKUP_ENCRYPTION_KEY"

docker compose stop "$SERVICE"
docker compose exec -T postgres pg_restore -U postgres --clean --if-exists --no-owner \
  --role="$DB" --exit-on-error -d "$DB" < "$WORK/db.dump"
docker compose start "$SERVICE"
echo "Wiederherstellung von $DB abgeschlossen."
