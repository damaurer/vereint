#!/bin/bash
# Nimmt ein Deployment per SSH entgegen (eigener Server, z. B. Strato).
# Laeuft als root ueber sudo, aufgerufen von /usr/local/bin/vereint-ssh-gate.
#
#   vereint-remote deploy     < paket.tgz  (bundle/ und ghcr.env)
#   vereint-remote rollback   < paket.tgz  (nur ghcr.env)
#
# ghcr.env enthaelt GHCR_USER und das kurzlebige GHCR_TOKEN des Workflows,
# damit der Server private Images ziehen kann. Das Paket kommt ueber die
# verschluesselte SSH-Verbindung und wird nach dem Lauf geloescht.
set -euo pipefail

ACTION="${1:-}"
case "$ACTION" in
  deploy | rollback) ;;
  *) echo "Aufruf: vereint-remote deploy|rollback < paket.tgz" >&2; exit 1 ;;
esac

export HOME=/root
work="$(mktemp -d /var/tmp/vereint-deploy.XXXXXX)"
trap 'rm -rf "$work"' EXIT
chmod 700 "$work"

# Hoechstens 200 MB annehmen; das Paket ist normalerweise wenige MB gross.
head -c 200000000 > "$work/paket.tgz"
tar -xzf "$work/paket.tgz" -C "$work" --no-same-owner --no-same-permissions
rm -f "$work/paket.tgz"

GHCR_USER=""
GHCR_TOKEN=""
if [ -f "$work/ghcr.env" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      GHCR_USER) [[ "$value" =~ ^[A-Za-z0-9-]+(\[bot\])?$ ]] && GHCR_USER="$value" ;;
      GHCR_TOKEN) [[ "$value" =~ ^[A-Za-z0-9_]+$ ]] && GHCR_TOKEN="$value" ;;
    esac
  done < "$work/ghcr.env"
  rm -f "$work/ghcr.env"
fi
export GHCR_USER GHCR_TOKEN

if [ "$ACTION" = deploy ]; then
  [ -f "$work/bundle/bin/deploy.sh" ] || { echo "Paket enthaelt kein Bundle" >&2; exit 1; }
  bash "$work/bundle/bin/deploy.sh" deploy "$work/bundle"
else
  bash /srv/vereint/app/bin/deploy.sh rollback
fi
