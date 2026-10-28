#!/bin/bash
# Erzeugt .env neben compose.yaml aus den Secrets des Servers und den
# Image-Digests in images.env (von deploy.sh geprueft).
#
# Quelle der Secrets:
#   - Eigener Server (z. B. Strato): /srv/vereint/secrets.env, angelegt von
#     bin/server-setup.sh, nur fuer root lesbar (siehe docs/betrieb/strato.md).
#   - AWS: SSM Parameter Store unter /vereint/*, wenn es keine secrets.env gibt.
# Die Datei ist nur fuer root lesbar und wird bei jedem Deployment neu erzeugt.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$APP_DIR/.env"
IMAGES="$APP_DIR/images.env"
SECRETS_FILE="${VEREINT_SECRETS_FILE:-/srv/vereint/secrets.env}"
[ -f "$IMAGES" ] || { echo "$IMAGES fehlt" >&2; exit 1; }
TMP="$(mktemp "$APP_DIR/.env.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"

# Gibt KEY='wert' aus und weist ungueltige Namen und Werte ab.
emit() {
  local key="$1" value="$2"
  [[ "$key" =~ ^[A-Z0-9_]+$ ]] || { echo "Ungueltiger Name: $key" >&2; return 1; }
  [[ "$value" != *"'"* ]] || { echo "Wert von $key enthaelt ein Hochkomma" >&2; return 1; }
  printf "%s='%s'\n" "$key" "$value"
}

from_secrets_file() {
  local owner mode line key value
  owner="$(stat -c %u "$SECRETS_FILE")"
  mode="$(stat -c %a "$SECRETS_FILE")"
  [ "$owner" = 0 ] && [ "$mode" = 600 ] ||
    { echo "$SECRETS_FILE muss root gehoeren und Rechte 600 haben (ist $owner/$mode)" >&2; return 1; }
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ -z "${line// /}" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == *=* ]] || { echo "Zeile ohne '=' in $SECRETS_FILE: ${line%%=*}" >&2; return 1; }
    key="${line%%=*}"
    value="${line#*=}"
    # Optionale Anfuehrungszeichen um den ganzen Wert entfernen.
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    emit "$key" "$value"
  done < "$SECRETS_FILE"
}

from_ssm() {
  local token region name value
  token="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')"
  region="$(curl -fsS -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/placement/region)"
  aws ssm get-parameters-by-path --region "$region" --path /vereint --recursive --with-decryption \
    --query 'Parameters[].[Name,Value]' --output text |
    while IFS=$'\t' read -r name value; do
      emit "${name##*/}" "$value"
    done
}

{
  echo "# Erzeugt von bin/fetch-env.sh am $(date -u +%FT%TZ). Nicht bearbeiten."
  sed -n "s/^\([A-Z_]*_IMAGE\)=\(.*\)$/\1='\2'/p" "$IMAGES"
  if [ -f "$SECRETS_FILE" ]; then
    from_secrets_file
  else
    from_ssm
  fi
} > "$TMP"

value_of() { sed -n "s/^$1='\(.*\)'$/\1/p" "$TMP" | tail -n 1; }

missing=""
for key in PUBLIC_DOMAIN SESSION_SECRET POSTGRES_PASSWORD KEYCLOAK_DB_PASSWORD VEREINT_DB_PASSWORD \
  KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_CLIENT_SECRET KEYCLOAK_TABLET_CLIENT_SECRET \
  KEYCLOAK_REGISTRATION_CLIENT_SECRET DATA_ENCRYPTION_KEY BACKUP_ENCRYPTION_KEY; do
  [ -n "$(value_of "$key")" ] || missing="$missing $key"
done
# Dateien liegen entweder in S3 (AWS) oder im Verzeichnis des Servers.
case "$(value_of STORAGE_BACKEND)" in
  filesystem) ;;
  s3 | "")
    for key in S3_BUCKET S3_REGION S3_ACCESS_KEY S3_SECRET_KEY; do
      [ -n "$(value_of "$key")" ] || missing="$missing $key"
    done
    ;;
  *) echo "STORAGE_BACKEND muss filesystem oder s3 sein" >&2; exit 1 ;;
esac
[ -z "$missing" ] || { echo "Es fehlen Werte:$missing" >&2; exit 1; }
[ "$(grep -c '_IMAGE=' "$TMP")" -eq 3 ] || { echo "images.env unvollstaendig" >&2; exit 1; }
mv "$TMP" "$TARGET"
trap - EXIT
echo "$TARGET geschrieben."
