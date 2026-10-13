#!/bin/bash
# Startet deploy.sh auf dem Server ueber AWS Systems Manager und wartet auf
# das Ergebnis. Aufgerufen von .github/workflows/deploy.yml.
#
# Erwartet: ACTION (deploy|rollback), INSTANCE_ID, AWS_REGION, GHCR_TOKEN,
# GITHUB_ACTOR und fuer deploy zusaetzlich DEPLOY_BUCKET und BUNDLE_KEY.
set -euo pipefail

: "${ACTION:?}" "${INSTANCE_ID:?}" "${AWS_REGION:?}" "${GHCR_TOKEN:?}" "${GITHUB_ACTOR:?}"

if [ "$ACTION" = deploy ]; then
  : "${DEPLOY_BUCKET:?}" "${BUNDLE_KEY:?}"
  remote=$(cat <<SCRIPT
set -euo pipefail
# Run Command setzt kein HOME; docker login braucht es fuer seine Konfiguration.
export HOME=/root
work="\$(mktemp -d /var/tmp/vereint-deploy.XXXXXX)"
trap 'rm -rf "\$work"' EXIT
aws s3 cp --region '$AWS_REGION' 's3://$DEPLOY_BUCKET/$BUNDLE_KEY' "\$work/bundle.tgz" --only-show-errors
mkdir "\$work/bundle"
tar -xzf "\$work/bundle.tgz" -C "\$work/bundle"
GHCR_USER='$GITHUB_ACTOR' GHCR_TOKEN='$GHCR_TOKEN' bash "\$work/bundle/bin/deploy.sh" deploy "\$work/bundle"
SCRIPT
)
elif [ "$ACTION" = rollback ]; then
  remote="export HOME=/root; GHCR_USER='$GITHUB_ACTOR' GHCR_TOKEN='$GHCR_TOKEN' bash /srv/vereint/app/bin/deploy.sh rollback"
else
  echo "Unbekannte Aktion: $ACTION" >&2
  exit 1
fi

params="$(jq -n --arg c "$remote" '{commands: [$c], executionTimeout: ["2700"]}')"
command_id="$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "vereint $ACTION (GitHub run ${GITHUB_RUN_ID:-manuell})" \
  --parameters "$params" \
  --query Command.CommandId --output text)"
echo "SSM-Befehl $command_id gestartet"

status=Pending
for _ in $(seq 1 200); do
  sleep 15
  status="$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$INSTANCE_ID" \
    --query Status --output text 2>/dev/null || echo Pending)"
  case "$status" in
    Pending | InProgress | Delayed) ;;
    *) break ;;
  esac
done

echo "::group::Ausgabe des Servers"
aws ssm get-command-invocation --command-id "$command_id" --instance-id "$INSTANCE_ID" \
  --query StandardOutputContent --output text || true
echo "::endgroup::"
errors="$(aws ssm get-command-invocation --command-id "$command_id" --instance-id "$INSTANCE_ID" \
  --query StandardErrorContent --output text || true)"
if [ -n "$errors" ] && [ "$errors" != None ]; then
  echo "::group::Fehlerausgabe des Servers"
  echo "$errors"
  echo "::endgroup::"
fi

if [ "$status" != Success ]; then
  echo "::error::$ACTION auf dem Server fehlgeschlagen (Status: $status). Bei einem fehlgeschlagenen Deployment laeuft wieder der vorherige Stand."
  exit 1
fi
echo "$ACTION erfolgreich"
