#!/bin/bash
# Richtet die systemd-Units fuer Backups ein. Idempotent; wird bei jedem
# Deployment ausgefuehrt.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ "$APP_DIR" = /srv/vereint/app ] || { echo "Erwartet unter /srv/vereint/app, gefunden: $APP_DIR" >&2; exit 1; }

chmod 700 "$APP_DIR/bin"/*.sh
mkdir -p /srv/vereint/data/caddy /srv/vereint/data/postgres

install -m 644 "$APP_DIR/systemd/vereint-backup.service" /etc/systemd/system/
install -m 644 "$APP_DIR/systemd/vereint-backup.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now vereint-backup.timer
