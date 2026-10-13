#!/bin/bash
# Erzeugt /srv/vereint/app/.env aus dem AWS SSM Parameter Store (/vereint/*).
# Aufruf: fetch-env.sh <image-tag>
# Die Datei ist nur fuer root lesbar und wird bei jedem Deployment neu erzeugt.
set -euo pipefail

IMAGE_TAG="${1:?Aufruf: fetch-env.sh <image-tag>}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$APP_DIR/.env"
TMP="$(mktemp "$APP_DIR/.env.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"

TOKEN="$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')"
REGION="$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/region)"

{
  echo "# Erzeugt von bin/fetch-env.sh am $(date -u +%FT%TZ). Nicht bearbeiten."
  echo "IMAGE_TAG='$IMAGE_TAG'"
  aws ssm get-parameters-by-path --region "$REGION" --path /vereint --recursive --with-decryption \
    --query 'Parameters[].[Name,Value]' --output text |
    while IFS=$'\t' read -r name value; do
      key="${name##*/}"
      [[ "$key" =~ ^[A-Z0-9_]+$ ]] || { echo "Ungueltiger Parametername: $name" >&2; exit 1; }
      [[ "$value" != *"'"* ]] || { echo "Wert von $key enthaelt ein Hochkomma" >&2; exit 1; }
      printf "%s='%s'\n" "$key" "$value"
    done
} > "$TMP"

grep -q '^SESSION_SECRET=' "$TMP" || { echo "Secrets fehlen im Parameter Store" >&2; exit 1; }
mv "$TMP" "$TARGET"
trap - EXIT
echo "$TARGET geschrieben."
