#!/bin/bash
# Stellt eine Datenbank aus einem verschluesselten Backup in S3 wieder her.
#
#   restore.sh <keycloak|vereint> [latest|<s3-key>]
#
# Die Ziel-Datenbank wird dabei vollstaendig ersetzt; der zugehoerige Dienst
# wird fuer die Dauer der Wiederherstellung gestoppt. Vorher bitte pruefen,
# ob ein Snapshot des Datenvolumes die bessere Wahl ist (siehe README).
set -euo pipefail

DB="${1:?Aufruf: restore.sh <keycloak|vereint> [latest|<s3-key>]}"
WHICH="${2:-latest}"
case "$DB" in
  keycloak) SERVICE=keycloak ;;
  vereint) SERVICE=baseservice ;;
  *) echo "Unbekannte Datenbank: $DB" >&2; exit 1 ;;
esac

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
set -a
# shellcheck disable=SC1091
source ./.env
set +a
REGION="$S3_REGION"

if [ "$WHICH" = latest ]; then
  KEY="$(aws s3api list-objects-v2 --region "$REGION" --bucket "$BACKUP_BUCKET" --prefix "postgres/$DB/" \
    --query 'sort_by(Contents, &LastModified)[-1].Key' --output text)"
else
  KEY="$WHICH"
fi
[ -n "$KEY" ] && [ "$KEY" != None ] || { echo "Kein Backup fuer $DB gefunden" >&2; exit 1; }

echo "Stelle $DB aus s3://$BACKUP_BUCKET/$KEY wieder her."
echo "Die aktuelle Datenbank $DB wird dabei ueberschrieben."
read -r -p "Zum Fortfahren den Namen der Datenbank eingeben: " confirm
[ "$confirm" = "$DB" ] || { echo "Abgebrochen."; exit 1; }

WORK="$(mktemp -d /var/tmp/vereint-restore.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"

aws s3 cp --region "$REGION" --only-show-errors "s3://$BACKUP_BUCKET/$KEY" "$WORK/db.dump.gpg"
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --output "$WORK/db.dump" --decrypt "$WORK/db.dump.gpg" 3<<<"$BACKUP_ENCRYPTION_KEY"

docker compose stop "$SERVICE"
docker compose exec -T postgres pg_restore -U postgres --clean --if-exists --no-owner \
  --role="$DB" --exit-on-error -d "$DB" < "$WORK/db.dump"
docker compose start "$SERVICE"
echo "Wiederherstellung von $DB abgeschlossen."
