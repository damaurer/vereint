#!/bin/bash
# Richtet einen frischen Linux-Server (Ubuntu 24.04/26.04 oder Debian 12/13,
# z. B. ein Strato VPS) einmalig fuer Vereint ein. Als root ausfuehren:
#
#   bash server-setup.sh --domain app.example.de \
#     --deploy-key 'ssh-ed25519 AAAA... github-actions-deploy'
#
# Das Skript ist idempotent (mehrfach ausfuehrbar) und
#   1. aktualisiert das System und schaltet automatische Sicherheitsupdates an,
#   2. installiert Docker (offizielles Paket), rclone, GnuPG, fail2ban, ufw,
#   3. sperrt SSH-Login per Passwort (nur Schluessel) und laesst in der
#      Firewall nur SSH, 80 und 443 zu,
#   4. legt eine Swap-Datei an, wenn der Server wenig Arbeitsspeicher hat,
#   5. legt den Benutzer `deploy` an, der ueber SSH ausschliesslich
#      `deploy` und `rollback` ausloesen darf (fuer GitHub Actions),
#   6. erzeugt /srv/vereint/secrets.env mit zufaelligen Passwoertern und
#      Schluesseln, sofern es sie noch nicht gibt. Vorhandene Werte bleiben.
#
# Anleitung mit allen Schritten drumherum: docs/betrieb/strato.md
set -euo pipefail

DOMAIN=""
DEPLOY_KEY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --deploy-key) DEPLOY_KEY="${2:-}"; shift 2 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 1 ;;
  esac
done

log() { echo "== $*"; }
die() { echo "FEHLER: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Bitte als root ausfuehren"
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || die "--domain fehlt oder ist ungueltig (z. B. app.example.de)"
[[ "$DEPLOY_KEY" =~ ^ssh-(ed25519|rsa)\ [A-Za-z0-9+/=]+( .*)?$ ]] || die "--deploy-key fehlt (oeffentlicher Schluessel, beginnt mit ssh-ed25519)"
# shellcheck disable=SC1091
. /etc/os-release
case "$ID" in
  ubuntu | debian) ;;
  *) die "Nur Ubuntu oder Debian werden unterstuetzt (gefunden: $ID)" ;;
esac
[ -s /root/.ssh/authorized_keys ] ||
  die "root hat keinen SSH-Schluessel (/root/.ssh/authorized_keys). Erst 'ssh-copy-id root@<server>' vom eigenen Rechner, sonst sperrt das Skript dich aus."

export DEBIAN_FRONTEND=noninteractive

log "System aktualisieren"
apt-get update -q
apt-get -y -q -o Dpkg::Options::=--force-confold upgrade
apt-get install -y -q ca-certificates curl gnupg jq rclone ufw fail2ban unattended-upgrades openssl sudo

log "Automatische Sicherheitsupdates (Neustart bei Bedarf um 04:00 UTC)"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF
cat > /etc/apt/apt.conf.d/52vereint-unattended <<'CONF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
CONF

log "Docker installieren"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

log "SSH nur mit Schluessel"
# 10- steht vor den Dateien des Anbieters (z. B. 50-cloud-init.conf) und gewinnt.
cat > /etc/ssh/sshd_config.d/10-vereint.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
X11Forwarding no
MaxAuthTries 4
CONF
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd

log "Firewall: nur SSH, HTTP und HTTPS"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
# Docker oeffnet nur die Ports aus compose.yaml (80/443); die Keycloak-Konsole
# lauscht ausschliesslich auf 127.0.0.1.
systemctl enable --now fail2ban

log "Swap"
mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ] && [ "$mem_kb" -lt 8000000 ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "Benutzer deploy fuer GitHub Actions"
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
passwd -l deploy >/dev/null
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
printf 'restrict,command="/usr/local/bin/vereint-ssh-gate" %s\n' "$DEPLOY_KEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# Erste Fassung der beiden Skripte; jedes Deployment aktualisiert sie (install.sh).
script_dir="$(cd "$(dirname "$0")" && pwd)"
for f in ssh-gate.sh remote.sh; do
  [ -f "$script_dir/$f" ] || die "$f fehlt neben server-setup.sh (den ganzen Ordner deploy/bin kopieren)"
done
install -m 755 "$script_dir/ssh-gate.sh" /usr/local/bin/vereint-ssh-gate
install -m 700 "$script_dir/remote.sh" /usr/local/sbin/vereint-remote
cat > /etc/sudoers.d/vereint-deploy <<'CONF'
deploy ALL=(root) NOPASSWD: /usr/local/sbin/vereint-remote deploy, /usr/local/sbin/vereint-remote rollback
CONF
chmod 440 /etc/sudoers.d/vereint-deploy
visudo -cf /etc/sudoers.d/vereint-deploy >/dev/null

log "Verzeichnisse"
install -d -m 711 /srv/vereint
install -d -m 700 /srv/vereint/app /srv/vereint/data /srv/vereint/backups /srv/vereint/releases
install -d -m 700 -o 10001 -g 10001 /srv/vereint/data/files

log "Secrets"
SECRETS=/srv/vereint/secrets.env
touch "$SECRETS"
chmod 600 "$SECRETS"
chown root:root "$SECRETS"

has() { grep -q "^$1=" "$SECRETS"; }
put() { has "$1" || printf '%s=%s\n' "$1" "$2" >> "$SECRETS"; }
random() { tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 48 || true; }

if ! has PUBLIC_DOMAIN; then
  cat >> "$SECRETS" <<CONF
# Vereint: Werte fuer den Produktionsbetrieb. Nur fuer root lesbar.
# Erzeugt von server-setup.sh am $(date -u +%F). Aenderungen wirken beim
# naechsten Deployment. Die Schluessel ganz unten zusaetzlich offline sichern!

# --- Domain und Funktionen ---
CONF
fi
put PUBLIC_DOMAIN "$DOMAIN"
put STORAGE_BACKEND filesystem
# Eroeffnen eigener Gruppen erst einschalten, wenn Datenschutzerklaerung,
# Impressum und AGB fertig sind (docs/domains/rechtliches.md).
put SIGNUP_ENABLED false

if ! has BACKUP_REMOTE; then
  cat >> "$SECRETS" <<'CONF'

# --- Backups ausser Haus (siehe docs/betrieb/strato.md, Schritt Backups) ---
# rclone-Ziel, z. B. hidrive:vereint-backup oder storagebox:vereint-backup.
# Zugangsdaten stehen in /srv/vereint/rclone.conf.
BACKUP_REMOTE=
# Optional: URL, die nach jedem erfolgreichen Backup aufgerufen wird
# (z. B. healthchecks.io); bleibt der Aufruf aus, kommt eine E-Mail.
BACKUP_PING_URL=
CONF
fi

if ! has SESSION_SECRET; then
  echo "" >> "$SECRETS"
  echo "# --- Zufaellig erzeugt ---" >> "$SECRETS"
fi
for key in SESSION_SECRET KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_CLIENT_SECRET KEYCLOAK_TABLET_CLIENT_SECRET \
  KEYCLOAK_REGISTRATION_CLIENT_SECRET KEYCLOAK_DB_PASSWORD VEREINT_DB_PASSWORD POSTGRES_PASSWORD; do
  put "$key" "$(random)"
done

if ! has VAPID_PRIVATE_KEY; then
  # Web Push: P-256-Schluesselpaar in der DER-Form, die der baseservice liest.
  pem="$(openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 2>/dev/null)"
  put VAPID_ENABLED true
  put VAPID_SUBJECT "https://$DOMAIN"
  put VAPID_PUBLIC_KEY "$(openssl pkey -pubout -outform DER <<<"$pem" | base64 -w0)"
  put VAPID_PRIVATE_KEY "$(openssl pkcs8 -topk8 -nocrypt -outform DER <<<"$pem" | base64 -w0)"
fi

if ! has DATA_ENCRYPTION_KEY; then
  cat >> "$SECRETS" <<'CONF'

# --- OFFLINE SICHERN (Passwort-Manager) ---
# Ohne DATA_ENCRYPTION_KEY sind Chat, Bilder und Videos auch aus Backups
# nicht mehr lesbar; ohne BACKUP_ENCRYPTION_KEY lassen sich die
# Datenbank-Backups nicht entschluesseln. Nie aendern, nur wie in
# docs/betrieb/sicherheit-und-schluessel.md beschrieben rotieren.
CONF
  put DATA_ENCRYPTION_KEY "$(openssl rand -base64 32)"
fi
put BACKUP_ENCRYPTION_KEY "$(random)"

touch /srv/vereint/rclone.conf
chmod 600 /srv/vereint/rclone.conf

cat <<DONE

Fertig. Naechste Schritte (Details in docs/betrieb/strato.md):
  1. Schluessel offline sichern:   grep -E '^(DATA|BACKUP)_ENCRYPTION_KEY=' $SECRETS
  2. Backup-Ziel einrichten:       rclone config --config /srv/vereint/rclone.conf
     und BACKUP_REMOTE in $SECRETS eintragen
  3. In GitHub als Variable DEPLOY_SSH_KNOWN_HOSTS eintragen (Fingerabdruck
     dieses Servers; <IP> durch die oeffentliche IP ersetzen, falls falsch):
     $(hostname -I | awk '{print $1}') $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)
DONE
