#!/usr/bin/env bash
# Deploy pd-tinder:
#   scripts/deploy.sh              run the full local gate, build, push, restart
#   scripts/deploy.sh --config-only   ship configs only, start nothing (restore drill)
#
# Run from the repository root. Requires docker + buildx, terraform, the aws
# CLI, and credentials that can push to ECR and send SSM commands.
set -euo pipefail

REGION=${AWS_REGION:-ap-southeast-1}
ECR_REPO=pd-tinder
CONFIG_BUCKET=pdtinder-backup
TAG=${IMAGE_TAG:-$(git rev-parse --short HEAD)}
SITE_DOMAIN=${SITE_DOMAIN:-pdtinder.example.com}
CONFIG_ONLY=false
case "${1:-}" in
  "")
    ;;
  --config-only)
    CONFIG_ONLY=true
    ;;
  *)
    # Strict on purpose: a typo'd flag must never fall through to a full
    # deploy — in the restore drill that could start the app with an empty
    # database and replicate it over the replica.
    echo "unknown option: $1 (only --config-only is supported)" >&2
    exit 64
    ;;
esac

log() { printf '\n==> %s\n' "$*"; }

ECR_URI=$(aws ecr describe-repositories --repository-names "$ECR_REPO" \
  --region "$REGION" --query 'repositories[0].repositoryUri' --output text)
INSTANCE_ID=$(terraform -chdir=terraform output -raw instance_id)

if [[ "$CONFIG_ONLY" == "false" ]]; then
  log "Gate: check, unit/integration, e2e, build"
  npm run check
  npm test
  npm run test:e2e
  npm run build

  log "Build and push $ECR_URI:$TAG"
  aws ecr get-login-password --region "$REGION" |
    docker login --username AWS --password-stdin "$ECR_URI"
  docker buildx build --platform linux/amd64 --provenance=false \
    -t "$ECR_URI:$TAG" -t "$ECR_URI:latest" --push .
fi

log "Package instance configs"
CONFIG_DIR=$(mktemp -d)
trap 'rm -rf "$CONFIG_DIR"' EXIT
cp deploy/compose.yaml deploy/Caddyfile deploy/litestream.yml "$CONFIG_DIR"/
cat > "$CONFIG_DIR/.env" <<EOF
DATABASE_URL=/data/pd-tinder.db
ORIGIN=https://$SITE_DOMAIN
BODY_SIZE_LIMIT=5M
PORT=3000
SITE_DOMAIN=$SITE_DOMAIN
LITESTREAM_BUCKET=$CONFIG_BUCKET
APP_IMAGE=$ECR_URI:$TAG
EOF
tar -czf "$CONFIG_DIR/deploy.tar.gz" -C "$CONFIG_DIR" \
  compose.yaml Caddyfile litestream.yml .env
aws s3 cp "$CONFIG_DIR/deploy.tar.gz" "s3://$CONFIG_BUCKET/config/deploy.tar.gz"

if [[ "$CONFIG_ONLY" == "true" ]]; then
  log "Configs shipped to s3://$CONFIG_BUCKET/config/deploy.tar.gz — nothing started."
  exit 0
fi

log "Restart app on $INSTANCE_ID with $ECR_URI:$TAG"
# One line, no double quotes or backslashes, so it survives the JSON encoding
# the aws CLI applies to --parameters.
COMMAND="aws s3 cp s3://$CONFIG_BUCKET/config/deploy.tar.gz /srv/pdtinder/deploy.tar.gz && tar -xzf /srv/pdtinder/deploy.tar.gz -C /srv/pdtinder/deploy && cd /srv/pdtinder/deploy && aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_URI && APP_IMAGE=$ECR_URI:$TAG docker compose up -d --pull always"
aws ssm send-command \
  --region "$REGION" \
  --document-name "AWS-RunShellScript" \
  --instance-ids "$INSTANCE_ID" \
  --parameters "commands=[\"$COMMAND\"]" \
  --comment "pd-tinder deploy $TAG" \
  --output text --query 'Command.CommandId'

log "Deploy triggered (command id above). Watch it with:"
log "  aws ssm get-command-invocation --region $REGION --command-id <id> --instance-id $INSTANCE_ID --query 'StandardOutputContent'"
log "Then run the smoke test:"
log "  SMOKE_BASE_URL=https://$SITE_DOMAIN SMOKE_ADMIN_EMAIL=<admin-email> SMOKE_ADMIN_PASSWORD=<operator-only> npm run smoke"
