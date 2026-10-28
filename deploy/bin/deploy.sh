#!/bin/bash
# Rollt einen neuen Stand aus oder kehrt zum vorherigen zurueck. Wird von
# GitHub Actions ueber AWS Systems Manager als root aufgerufen (siehe
# .github/workflows/deploy.yml); von Hand geht es genauso.
#
#   deploy.sh deploy <bundle-verzeichnis>   neuen Stand ausrollen
#   deploy.sh rollback                      vorherigen Stand wiederherstellen
#
# Das Bundle ist der Inhalt von deploy/ plus images.env mit den Images als
# unveraenderliche Digests. Fuer private Images erwartet das Skript
# GHCR_USER und GHCR_TOKEN in der Umgebung.
#
# Ablauf eines Deployments:
#   1. images.env pruefen, Secrets holen, neue Images ziehen
#   2. Backup beider Datenbanken (wie nachts, inklusive Probe-Wiederherstellung).
#      Schlaegt es fehl, wird nicht deployt.
#   3. Bisherigen Stand nach releases/previous verschieben, neuen aktivieren
#   4. Starten und warten, bis alle Container gesund sind
#   5. Pruefen, dass Anwendung, API und Login von aussen antworten
# Scheitert Schritt 4 oder 5, wird automatisch der vorherige Stand gestartet.
set -euo pipefail

ROOT=/srv/vereint
APP_DIR="$ROOT/app"
RELEASES="$ROOT/releases"
PREVIOUS="$RELEASES/previous"
WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-600}"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "FEHLER: $*" >&2; exit 1; }

compose() { docker compose --project-directory "$1" -f "$1/compose.yaml" "${@:2}"; }

registry_login() {
  if [ -n "${GHCR_TOKEN:-}" ]; then
    printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:?GHCR_USER fehlt}" --password-stdin >/dev/null
  fi
}

registry_logout() { docker logout ghcr.io >/dev/null 2>&1 || true; }

# Erlaubt sind nur unsere drei Images, fest an einen Digest gebunden.
validate_images() {
  local file="$1" line count=0
  [ -f "$file" ] || die "images.env fehlt"
  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    [[ "$line" =~ ^(KEYCLOAK|BASESERVICE|WEBSERVICE)_IMAGE=ghcr\.io/[a-z0-9-]+/(keycloak|baseservice|webservice)@sha256:[0-9a-f]{64}$ ]] ||
      die "Ungueltige Zeile in images.env: $line"
    count=$((count + 1))
  done < "$file"
  [ "$count" -eq 3 ] || die "images.env muss genau drei Images enthalten"
}

# Prueft von aussen (ueber Caddy), ob Anwendung, API und Login antworten.
# Das Zertifikat wird hier bewusst nicht geprueft: Beim allerersten Start kann
# Let's Encrypt noch ausstehen, die Weiterleitung soll trotzdem getestet werden.
smoke_test() {
  local dir="$1" domain url
  domain="$(sed -n "s/^PUBLIC_DOMAIN='\(.*\)'$/\1/p" "$dir/.env")"
  [ -n "$domain" ] || die "PUBLIC_DOMAIN fehlt in .env"
  for path in /api/v1/health /kc/realms/vereint/.well-known/openid-configuration /; do
    url="https://$domain$path"
    for _ in $(seq 1 18); do
      if curl -fsS -k --noproxy "*" -o /dev/null --max-time 10 --resolve "$domain:443:127.0.0.1" "$url"; then
        log "OK $path"
        continue 2
      fi
      sleep 10
    done
    log "Keine gesunde Antwort von $path"
    return 1
  done
}

start() {
  local dir="$1"
  "$dir/bin/install.sh" && compose "$dir" up -d --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT"
}

show_failure() {
  compose "$APP_DIR" ps || true
  compose "$APP_DIR" logs --tail=40 baseservice webservice keycloak || true
}

# Aktiviert den vorherigen Stand wieder. Die Datenbank bleibt, wie sie ist:
# Liquibase-Migrationen des fehlgeschlagenen Stands werden nicht
# zurueckgenommen (siehe README, Abschnitt Rollback).
restore_previous() {
  [ -f "$PREVIOUS/compose.yaml" ] || die "Kein vorheriger Stand vorhanden"
  log "Stelle vorherigen Stand wieder her"
  rm -rf "$RELEASES/failed"
  [ -d "$APP_DIR" ] && mv "$APP_DIR" "$RELEASES/failed"
  mv "$PREVIOUS" "$APP_DIR"
  "$APP_DIR/bin/fetch-env.sh"
  registry_login
  compose "$APP_DIR" pull --quiet
  registry_logout
  start "$APP_DIR"
  smoke_test "$APP_DIR"
  log "Vorheriger Stand laeuft wieder: $(tr '\n' ' ' < "$APP_DIR/images.env")"
}

deploy() {
  local bundle="${1:?Aufruf: deploy.sh deploy <bundle-verzeichnis>}"
  [ -f "$bundle/compose.yaml" ] || die "$bundle ist kein Deploy-Bundle"
  validate_images "$bundle/images.env"

  local stage="$RELEASES/incoming"
  rm -rf "$stage"
  mkdir -p "$RELEASES"
  cp -a "$bundle" "$stage"
  chmod 700 "$stage/bin"/*.sh
  "$stage/bin/fetch-env.sh"

  log "Ziehe Images"
  registry_login
  if ! compose "$stage" pull --quiet; then
    registry_logout
    die "Images konnten nicht geladen werden"
  fi
  registry_logout

  if [ -d "$APP_DIR" ] && [ -n "$(compose "$APP_DIR" ps -q postgres 2>/dev/null)" ]; then
    log "Backup vor dem Deployment"
    "$APP_DIR/bin/backup.sh" || die "Backup fehlgeschlagen, Deployment abgebrochen"
  else
    log "Erstes Deployment, kein Backup noetig"
  fi

  rm -rf "$PREVIOUS"
  if [ -f "$APP_DIR/compose.yaml" ]; then
    mv "$APP_DIR" "$PREVIOUS"
  elif [ -d "$APP_DIR" ]; then
    # Beim ersten Deployment legt die Server-Einrichtung ein leeres app/ an.
    # Es ist kein vorheriger Stand; rmdir bricht ab, falls doch etwas darin liegt.
    rmdir "$APP_DIR"
  fi
  mv "$stage" "$APP_DIR"
  # fetch-env.sh hat .env im Bundle-Verzeichnis erzeugt; nach dem Verschieben
  # neu schreiben, damit Pfade und Inhalt garantiert zusammenpassen.
  "$APP_DIR/bin/fetch-env.sh"

  log "Starte neuen Stand: $(tr '\n' ' ' < "$APP_DIR/images.env")"
  if start "$APP_DIR" && smoke_test "$APP_DIR"; then
    docker image prune -af --filter "until=336h" >/dev/null || true
    log "Deployment erfolgreich"
    return 0
  fi

  log "Neuer Stand ist nicht gesund"
  show_failure
  if [ -f "$PREVIOUS/compose.yaml" ]; then
    # Eigener Prozess, damit `set -e` im Rollback wirkt.
    DEPLOY_LOCK_HELD=1 bash "$0" rollback || die "Rollback fehlgeschlagen, bitte manuell pruefen"
    die "Deployment fehlgeschlagen, vorheriger Stand wurde wiederhergestellt"
  fi
  die "Deployment fehlgeschlagen (erstes Deployment, kein vorheriger Stand)"
}

main() {
  [ "$(id -u)" -eq 0 ] || die "Bitte als root ausfuehren"
  if [ -z "${DEPLOY_LOCK_HELD:-}" ]; then
    exec 9>/run/vereint-deploy.lock
    flock -n 9 || die "Es laeuft bereits ein Deployment"
  fi
  case "${1:-}" in
    deploy) deploy "${2:-}" ;;
    rollback) restore_previous ;;
    *) die "Aufruf: deploy.sh deploy <bundle-verzeichnis> | deploy.sh rollback" ;;
  esac
}

main "$@"
