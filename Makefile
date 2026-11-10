COMPOSE = docker compose

# The Mac's LAN IP, used by `dev-lan` so a phone on the same Wi-Fi reaches the
# Mac rather than itself. Auto-detected from en0; override when wrong:
# `make dev-lan LAN=192.168.1.101`.
LAN ?= $(shell ipconfig getifaddr en0)

.PHONY: up down logs ps deps be-deps fe-deps be-command fe-command \
	be-check be-lint be-format be-test be-build be-migrate be-makemigration be-seed \
	push-keys push-test \
	fe-lint fe-test fe-build fe-og-banner contracts dev-lan deploy \
	e2e-up e2e e2e-smoke e2e-pwa e2e-lint e2e-report e2e-issues e2e-down

up:
	$(COMPOSE) up -d postgres minio backend frontend

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

# One install for the whole pnpm workspace. Run after changing dependencies on
# either side; `be-deps`/`fe-deps` are kept as familiar aliases.
deps:
	$(COMPOSE) build workspace e2e
	$(COMPOSE) run --rm --no-deps workspace pnpm install --no-frozen-lockfile

be-deps fe-deps: deps

# Escape hatches for one-off commands inside the container:
# `make be-command ARGS='pnpm why zod'`
be-command:
	$(COMPOSE) run --rm --no-deps -w /app/backend workspace $(ARGS)

fe-command:
	$(COMPOSE) run --rm --no-deps -w /app/frontend workspace $(ARGS)

# ---- Backend ----

# The full backend Definition of Done in one command (docs/DEVELOPMENT.md §5), including
# the contract drift check that CI runs. Use it before calling a change finished.
be-check: be-lint be-test be-build contracts
	git diff --exit-code contracts/ frontend/src/shared/api/

be-lint:
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-backend lint

be-format:
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-backend format

be-test:
	$(COMPOSE) up -d postgres
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-backend test $(args)

be-build:
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-backend build

be-migrate:
	$(COMPOSE) up -d postgres
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-backend db:migrate

# Drizzle derives the migration from the schema; `m` is unused but accepted so the
# old `make be-makemigration m="..."` habit keeps working.
be-makemigration:
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-backend db:generate

be-seed:
	$(COMPOSE) up -d postgres
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-backend db:seed

# Prints a fresh VAPID key pair for Web Push and writes nothing — copy the public
# key into the frontend env and both keys into the backend env. See
# backend/.env.example for where each one goes.
push-keys:
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-backend push:keys

# Sends one real push to a user's registered devices, through the same delivery
# path the app uses. Needs VAPID keys in the backend environment.
# Usage: make push-test EMAIL=user@example.com
push-test:
	$(COMPOSE) up -d postgres
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-backend push:test $(EMAIL)

# ---- Frontend ----

fe-lint:
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-frontend lint
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-frontend typecheck

fe-test:
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-frontend test:run $(args)

# The PWA talks to its own origin, so a build needs no API URL. Native builds do;
# they run on the host (see docs/DEVELOPMENT.md §10).
fe-build:
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-frontend build

# Пересобирает OG-баннер (превью ссылки в соцсетях) из исходника
# frontend/scripts/og/og-banner.svg в public/icons/og-banner.png.
# Нужен только после правки самого SVG — готовый PNG лежит в репозитории.
fe-og-banner:
	$(COMPOSE) run --rm --no-deps -w /app/frontend workspace node scripts/og/build-banner.mjs

# ---- Contract ----
# Zod route schemas -> contracts/openapi.json -> frontend types, in one step.
# Never edit the contract or the generated types by hand.
contracts:
	$(COMPOSE) run --rm --no-deps workspace pnpm contracts

# ---- Quick UI preview on a phone over LAN ----
# The dev server already listens on every interface and proxies /api to the
# backend, and the web bundle calls its own origin — so a phone on the same Wi-Fi
# only needs the Mac's address. See docs/DEVELOPMENT.md §11.2.
dev-lan:
	@echo "Dev UI on the phone: http://$(LAN):5173"
	$(COMPOSE) up -d frontend

# ---- Browser e2e (docs/e2e-spec.md) ----

# The database is dropped and rebuilt BEFORE the stand starts, because the reset
# cannot run against a database a live backend holds connections to, and
# `backend-e2e` has to come up on a known state. The URL is passed explicitly:
# `workspace` carries the DEV database URL, and the script refuses anything whose
# name does not end in _e2e precisely so a slip here cannot wipe dev data.
# `backend-e2e` is stopped before the reset, not after: DROP DATABASE … WITH
# (FORCE) terminates the connections a running backend holds, and its pool treats
# that as a fatal 57P01 and exits — leaving a container that reports "running"
# while nothing listens on 8000.
e2e-up:
	$(COMPOSE) up -d postgres minio
	-$(COMPOSE) stop backend-e2e
	$(COMPOSE) run --rm --no-deps \
		-e DOPAFIT_DATABASE_URL=postgresql://dopafit:dopafit@postgres:5432/dopafit_e2e \
		workspace pnpm --filter dopafit-backend e2e:reset
	$(COMPOSE) up -d backend-e2e frontend-e2e

# Point a run at one file or one check: `make e2e args='programs.spec.ts'`,
# `make e2e args='--grep PROG-01'`.
e2e: e2e-up
	$(COMPOSE) run --rm e2e pnpm --filter dopafit-e2e test $(args)

# The P0 subset, available locally and through the manual E2E workflow.
e2e-smoke: e2e-up
	$(COMPOSE) run --rm e2e pnpm --filter dopafit-e2e test --grep @smoke $(args)

# Build and serve the production PWA on its own origin. The regular dev server
# does not register a service worker. The PWA runner shares preview's network
# namespace, so Chromium reaches it via localhost (a trustworthy origin).
e2e-pwa: e2e-up
	$(COMPOSE) run --rm --no-deps frontend-e2e-pwa pnpm --filter dopafit-frontend build
	$(COMPOSE) up -d --wait --no-deps frontend-e2e-pwa
	$(COMPOSE) run --rm -e E2E_PWA=1 e2e-pwa pnpm --filter dopafit-e2e test --project=pwa $(args)

e2e-lint:
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-e2e lint

# The report of the LAST run; it is overwritten by the next one and gitignored.
# Serves it until interrupted.
#
# The address is printed here because Playwright prints the one it binds to —
# 0.0.0.0, which is what the server listens on inside the container, not an
# address to open. It matters beyond cosmetics: the report builds its trace links
# from window.location, and the trace viewer runs on a service worker, which the
# browser refuses to register on a 0.0.0.0 origin (localhost is secure by
# definition, a bare IP is not). Open it on 0.0.0.0 and every trace is a blank
# page; open it on localhost and the viewer works.
e2e-report:
	@echo ""
	@echo "  ОТКРЫВАТЬ:  http://localhost:9323"
	@echo "  Playwright ниже напечатает http://0.0.0.0:9323 — это адрес внутри"
	@echo "  контейнера. По нему отчёт откроется, но трассы будут пустыми."
	@echo ""
	$(COMPOSE) run --rm --no-deps --service-ports e2e pnpm --filter dopafit-e2e report

# The findings summary is generated from e2e/support/known-issues.ts, the one
# place they live — there is no document to keep in sync.
e2e-issues:
	$(COMPOSE) run --rm --no-deps workspace pnpm --filter dopafit-e2e issues

# Stops the stand without touching the dev one. The e2e database survives on
# purpose: `e2e-up` rebuilds it anyway, and keeping it lets a failure be inspected.
e2e-down:
	$(COMPOSE) stop backend-e2e frontend-e2e frontend-e2e-pwa

# ---- Release (host-side, see docs/deploy.md) ----
# Thin wrapper over deploy.sh, which validates DOPAFIT_VPS itself.
# Usage: DOPAFIT_VPS=user@host make deploy
deploy:
	./deploy/deploy.sh
