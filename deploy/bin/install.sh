#!/bin/bash
# Richtet Verzeichnisse, die systemd-Units fuer Backups und (auf einem eigenen
# Server) den SSH-Zugang fuer Deployments ein. Idempotent; wird bei jedem
# Deployment ausgefuehrt.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ "$APP_DIR" = /srv/vereint/app ] || { echo "Erwartet unter /srv/vereint/app, gefunden: $APP_DIR" >&2; exit 1; }

chmod 700 "$APP_DIR/bin"/*.sh
mkdir -p /srv/vereint/data/caddy /srv/vereint/data/postgres
# Dateien (STORAGE_BACKEND=filesystem) gehoeren dem Benutzer des baseservice-Images.
install -d -m 700 -o 10001 -g 10001 /srv/vereint/data/files
install -d -m 700 /srv/vereint/backups

install -m 644 "$APP_DIR/systemd/vereint-backup.service" /etc/systemd/system/
install -m 644 "$APP_DIR/systemd/vereint-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now vereint-backup.timer

# Deployments per SSH (eigener Server): Neue Fassungen der beiden Skripte
# uebernehmen. Eingerichtet werden sie einmalig von bin/server-setup.sh.
if [ -f /usr/local/sbin/vereint-remote ]; then
  install -m 755 "$APP_DIR/bin/ssh-gate.sh" /usr/local/bin/vereint-ssh-gate
  install -m 700 "$APP_DIR/bin/remote.sh" /usr/local/sbin/vereint-remote
fi
