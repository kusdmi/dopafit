#!/usr/bin/env bash
# Build the app image locally (Apple Silicon -> linux/amd64), ship it to the VPS
# over SSH, and restart the stack.
# Usage: DOPAFIT_VPS=user@host ./deploy/deploy.sh
#
# The normal path is CI/CD: a push to main builds, publishes to GHCR and deploys
# (.github/workflows/ci.yml). This script is the fallback - GitHub is down, or you
# need to put uncommitted work on the stand - and it deliberately needs nothing but
# SSH and a local Docker.
#
# It loads the image straight into the VPS's Docker under the name the stand expects,
# so it works whether or not the stand is configured to pull from a registry.
set -euo pipefail

VPS="${DOPAFIT_VPS:?Set DOPAFIT_VPS=user@host}"
REMOTE_DIR="dopafit"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="$(git -C "$ROOT" rev-parse --short HEAD)"

# The stand's own prefix wins: once it pulls from a registry, an image built under the
# local default would simply be ignored by compose. Ask the VPS rather than guess.
REMOTE_PREFIX="$(ssh "$VPS" "sed -n 's/^DOPAFIT_IMAGE_PREFIX=//p' ~/$REMOTE_DIR/.env 2>/dev/null | tail -1" || true)"
PREFIX="${DOPAFIT_IMAGE_PREFIX:-${REMOTE_PREFIX:-dopafit}}"

# One image carries the API and the PWA bundle. The PWA talks to its own origin,
# so no API URL is baked in at build time.
#
# The Web Push public key is the exception: import.meta.env is resolved when the
# bundle is built, so it has to go in as a build argument. Read it from the stand's
# .env.prod - that is where its backend counterpart lives, and the two keys must
# match, or the push service refuses every subscription taken out under the other.
VAPID_PUBLIC_KEY="${DOPAFIT_VAPID_PUBLIC_KEY:-$(sed -n 's/^DOPAFIT_VAPID_PUBLIC_KEY=//p' "$ROOT/deploy/.env.prod" 2>/dev/null | tail -1)}"
if [ -z "$VAPID_PUBLIC_KEY" ]; then
  # The app would refuse to start anyway (config.ts guards it in production), but that
  # only surfaces after the whole image has been built and shipped. Stop here instead.
  echo "No VAPID public key: set DOPAFIT_VAPID_PUBLIC_KEY in deploy/.env.prod" >&2
  echo "Generate a pair with: make push-keys" >&2
  exit 1
fi

echo "==> Building app image (linux/amd64, tag $TAG)"
docker buildx build --platform linux/amd64 --target prod --load \
  --build-arg VITE_VAPID_PUBLIC_KEY="$VAPID_PUBLIC_KEY" \
  -t "$PREFIX-app:latest" -t "$PREFIX-app:$TAG" "$ROOT"

echo "==> Shipping the image to $VPS (this can take a while)"
docker save "$PREFIX-app:latest" "$PREFIX-app:$TAG" | gzip | \
  ssh "$VPS" "gunzip | docker load"

echo "==> Syncing compose files"
ssh "$VPS" "mkdir -p ~/$REMOTE_DIR/conf.d ~/$REMOTE_DIR/certs"
scp "$ROOT/deploy/docker-compose.prod.yml" "$ROOT/deploy/Caddyfile" "$VPS:$REMOTE_DIR/"

# Pin the tag the same way ci-deploy.sh does, so a later `up -d` on the box brings up
# what was actually deployed instead of drifting back to whatever :latest points at.
echo "==> Restarting stack (migrate runs before app)"
ssh "$VPS" "cd ~/$REMOTE_DIR \
  && (grep -q '^DOPAFIT_IMAGE_TAG=' .env \
      && sed -i 's|^DOPAFIT_IMAGE_TAG=.*|DOPAFIT_IMAGE_TAG=$TAG|' .env \
      || printf 'DOPAFIT_IMAGE_TAG=%s\n' '$TAG' >> .env) \
  && docker compose -f docker-compose.prod.yml up -d --remove-orphans"

echo "==> Done. Status:"
ssh "$VPS" "cd ~/$REMOTE_DIR && docker compose -f docker-compose.prod.yml ps"
echo "==> Rollback: ssh, then DOPAFIT_IMAGE_TAG=<old-sha> docker compose -f docker-compose.prod.yml up -d"
