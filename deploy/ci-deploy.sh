#!/usr/bin/env bash
# Runs ON THE VPS, invoked by CI over SSH. The deploy key in ~/.ssh/authorized_keys is
# pinned to this script with command="...", so a leaked key can redeploy an existing
# image and nothing else - no shell, no reading .env.prod.
#
# The image tag arrives through SSH_ORIGINAL_COMMAND (the only thing the caller controls),
# so it is validated before it reaches docker.
set -euo pipefail

DIR="$HOME/dopafit"
COMPOSE="docker compose -f $DIR/docker-compose.prod.yml"
KEEP_IMAGES=5
READY_TRIES=30
READY_INTERVAL=2

TAG="${SSH_ORIGINAL_COMMAND:-}"
# A tag is a short git SHA and nothing else: this string is interpolated into docker
# commands, and the caller is whoever holds the key.
if ! [[ "$TAG" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Expected a git SHA as the command, got: ${TAG:-<empty>}" >&2
  exit 64
fi

cd "$DIR"

# The previous tag, for the rollback hint printed if this deploy fails to come up.
PREVIOUS="$(sed -n 's/^DOPAFIT_IMAGE_TAG=//p' .env 2>/dev/null | tail -1)"

echo "==> Deploying $TAG (previous: ${PREVIOUS:-none})"

# Pin the tag in .env so a later plain `docker compose up -d` on the box brings up the
# same version instead of drifting back to whatever :latest points at.
if grep -q '^DOPAFIT_IMAGE_TAG=' .env; then
  sed -i "s|^DOPAFIT_IMAGE_TAG=.*|DOPAFIT_IMAGE_TAG=$TAG|" .env
else
  printf 'DOPAFIT_IMAGE_TAG=%s\n' "$TAG" >> .env
fi

echo "==> Pulling"
$COMPOSE pull --quiet app

echo "==> Starting (migrate runs before app)"
$COMPOSE up -d --remove-orphans

echo "==> Waiting for readiness"
ready=0
for _ in $(seq "$READY_TRIES"); do
  # Asked from inside the container: this is about the app and its database, not about
  # Caddy, TLS or DNS, which have their own failure modes.
  if $COMPOSE exec -T app node -e \
    'fetch("http://127.0.0.1:8000/health/ready").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' \
    2>/dev/null; then
    ready=1
    break
  fi
  sleep "$READY_INTERVAL"
done

if [ "$ready" -ne 1 ]; then
  echo "!! $TAG did not become ready in $((READY_TRIES * READY_INTERVAL))s" >&2
  echo "--- migrate ---" >&2
  $COMPOSE logs --tail 30 migrate >&2 || true
  echo "--- app ---" >&2
  $COMPOSE logs --tail 30 app >&2 || true
  if [ -n "$PREVIOUS" ]; then
    echo "" >&2
    echo "Roll back with:" >&2
    echo "  ssh <vps> \"cd ~/dopafit && sed -i 's|^DOPAFIT_IMAGE_TAG=.*|DOPAFIT_IMAGE_TAG=$PREVIOUS|' .env && docker compose -f docker-compose.prod.yml up -d\"" >&2
  fi
  exit 1
fi

# Only once the new version is known good: until then the older images are the way back.
# Docker refuses to remove an image in use, so the running one cannot be cut by accident.
echo "==> Pruning old images (keeping $KEEP_IMAGES)"
PREFIX="$(sed -n 's/^DOPAFIT_IMAGE_PREFIX=//p' .env 2>/dev/null | tail -1)"
# Same default as docker-compose.prod.yml, so an unset prefix prunes the local images
# rather than silently matching nothing.
IMAGE_NAME="${PREFIX:-dopafit}-app"
docker images "$IMAGE_NAME" --format '{{.Tag}}\t{{.CreatedAt}}' \
  | grep -v '^latest' \
  | sort -k2 -r \
  | tail -n "+$((KEEP_IMAGES + 1))" \
  | cut -f1 \
  | xargs -r -I{} docker rmi "$IMAGE_NAME:{}" 2>/dev/null || true

echo "==> $TAG is live"
$COMPOSE ps --format '{{.Service}}\t{{.Status}}'
