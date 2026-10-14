#!/usr/bin/env bash
# Startet bzw. stoppt den Produktions-Stack (deploy/compose.yaml) fuer die
# E2E-Tests unter https://vereint.test:8443.
#
#   e2e/stack.sh up      Images aus den Dockerfiles bauen und Stack starten
#   e2e/stack.sh down    Stack samt Daten entfernen
#   e2e/stack.sh logs    Logs aller Dienste
#
# Mit E2E_SKIP_BUILD=1 werden bereits vorhandene Images vereint-e2e/* genutzt.
# Alle Secrets sind Wegwerfwerte, die bei jedem `up` neu erzeugt werden und nur
# in e2e/.env.e2e bzw. e2e/.ca (beides nicht versioniert) liegen.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/e2e/.env.e2e"
compose() {
  docker compose --project-name vereint-e2e --project-directory "$ROOT/deploy" \
    --env-file "$ENV_FILE" \
    -f "$ROOT/deploy/compose.yaml" -f "$ROOT/e2e/compose.e2e.yaml" "$@"
}
rand() { openssl rand -hex 24; }

write_env() {
  umask 077
  cat > "$ENV_FILE" <<ENV
PUBLIC_DOMAIN=vereint.test
KEYCLOAK_IMAGE=vereint-e2e/keycloak
BASESERVICE_IMAGE=vereint-e2e/baseservice
WEBSERVICE_IMAGE=vereint-e2e/webservice
POSTGRES_PASSWORD=$(rand)
KEYCLOAK_DB_PASSWORD=$(rand)
VEREINT_DB_PASSWORD=$(rand)
KEYCLOAK_ADMIN_PASSWORD=$(rand)
KEYCLOAK_CLIENT_SECRET=$(rand)
KEYCLOAK_TABLET_CLIENT_SECRET=$(rand)
SESSION_SECRET=$(rand)
DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)
S3_BUCKET=vereint-e2e
S3_REGION=us-east-1
S3_ACCESS_KEY=e2e$(openssl rand -hex 8)
S3_SECRET_KEY=$(rand)
ENV
}

write_ca() {
  rm -rf "$ROOT/e2e/.ca" && mkdir -p "$ROOT/e2e/.ca"
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 30 \
    -subj "/CN=Vereint E2E Test CA" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -keyout "$ROOT/e2e/.ca/root.key" -out "$ROOT/e2e/.ca/root.crt" 2>/dev/null
  # Caddy (root) liest den Schluessel, webservice (uid 10001) nur das Zertifikat.
  chmod 644 "$ROOT/e2e/.ca/root.crt"
}

case "${1:-}" in
  up)
    if [ "${E2E_SKIP_BUILD:-0}" != "1" ]; then
      docker build -t vereint-e2e/keycloak "$ROOT/keycloak"
      docker build -t vereint-e2e/baseservice "$ROOT/baseservice"
      docker build -t vereint-e2e/webservice "$ROOT/webservice"
    fi
    write_env
    write_ca
    compose up -d --wait --wait-timeout 300
    ;;
  down)
    [ -f "$ENV_FILE" ] || write_env
    compose down -v --remove-orphans
    ;;
  logs)
    compose logs --no-color "${@:2}"
    ;;
  env)
    # Gibt einzelne Werte fuer die Tests aus, z. B. `stack.sh env KEYCLOAK_ADMIN_PASSWORD`.
    grep "^$2=" "$ENV_FILE" | cut -d= -f2-
    ;;
  *)
    echo "Aufruf: $0 up|down|logs|env NAME" >&2
    exit 2
    ;;
esac
