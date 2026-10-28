#!/bin/bash
# Startet ein Deployment oder einen Rollback auf einem eigenen Server per SSH
# (z. B. Strato VPS). Aufgerufen von .github/workflows/deploy.yml.
#
# Der Schluessel darf auf dem Server nur `deploy` oder `rollback` ausloesen
# (erzwungener Befehl, siehe deploy/bin/server-setup.sh). Uebertragen wird ein
# Paket mit dem Bundle und dem kurzlebigen GHCR-Token auf stdin; die Ausgabe
# des Servers erscheint direkt im Log.
#
# Erwartet: ACTION (deploy|rollback), DEPLOY_HOST, DEPLOY_SSH_KEY,
# DEPLOY_SSH_KNOWN_HOSTS, GHCR_TOKEN, GITHUB_ACTOR, optional DEPLOY_USER und
# DEPLOY_PORT; fuer deploy zusaetzlich das Bundle unter $RUNNER_TEMP/bundle.
set -euo pipefail

: "${ACTION:?}" "${DEPLOY_HOST:?}" "${DEPLOY_SSH_KEY:?}" "${DEPLOY_SSH_KNOWN_HOSTS:?}" "${GHCR_TOKEN:?}" "${GITHUB_ACTOR:?}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
case "$ACTION" in
  deploy | rollback) ;;
  *) echo "Unbekannte Aktion: $ACTION" >&2; exit 1 ;;
esac

work="$(mktemp -d "${RUNNER_TEMP:-/tmp}/vereint-ssh.XXXXXX")"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"

printf '%s\n' "$DEPLOY_SSH_KEY" > "$work/key"
printf '%s\n' "$DEPLOY_SSH_KNOWN_HOSTS" > "$work/known_hosts"
chmod 600 "$work/key"

mkdir "$work/paket"
printf 'GHCR_USER=%s\nGHCR_TOKEN=%s\n' "$GITHUB_ACTOR" "$GHCR_TOKEN" > "$work/paket/ghcr.env"
if [ "$ACTION" = deploy ]; then
  cp -r "${RUNNER_TEMP:?}/bundle" "$work/paket/bundle"
fi
tar -czf "$work/paket.tgz" -C "$work/paket" .
rm -rf "$work/paket"

# StrictHostKeyChecking: Nur der Server mit dem hinterlegten Fingerabdruck
# bekommt das Paket. ServerAlive haelt die Verbindung waehrend langer
# Image-Downloads offen.
if ssh -i "$work/key" -p "$DEPLOY_PORT" \
  -o BatchMode=yes -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$work/known_hosts" \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=10 -o ConnectTimeout=30 \
  "$DEPLOY_USER@$DEPLOY_HOST" "$ACTION" < "$work/paket.tgz"; then
  echo "$ACTION erfolgreich"
else
  echo "::error::$ACTION auf dem Server fehlgeschlagen. Bei einem fehlgeschlagenen Deployment laeuft wieder der vorherige Stand."
  exit 1
fi
