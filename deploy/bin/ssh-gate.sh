#!/bin/bash
# Erzwungener Befehl fuer den SSH-Schluessel von GitHub Actions
# (authorized_keys des Benutzers `deploy`, siehe bin/server-setup.sh).
# Laesst genau zwei Befehle zu und reicht sie an das Root-Skript weiter; alles
# andere (Shell, Port-Weiterleitung, scp) ist gesperrt.
set -euo pipefail

case "${SSH_ORIGINAL_COMMAND:-}" in
  deploy | rollback) exec sudo -n /usr/local/sbin/vereint-remote "$SSH_ORIGINAL_COMMAND" ;;
  *)
    echo "Erlaubt sind nur: deploy, rollback" >&2
    exit 1
    ;;
esac
