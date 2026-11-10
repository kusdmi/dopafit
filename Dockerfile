FROM node:24-slim AS base
RUN npm install -g pnpm@10.17.1
WORKDIR /app

FROM base AS dev
CMD ["pnpm", "--filter", "dopafit-backend", "dev"]

# Browser e2e runs on Microsoft's own image rather than in `dev`: node:24-slim
# carries none of Chromium's system libraries, and installing them in `dev` would
# push ~600 MB into `workspace`, `backend` and `frontend`, none of which drive a
# browser. The image tag must match the minor of @playwright/test in
# e2e/package.json — Playwright refuses to start when the browser revision it
# expects is not the one baked into the image.
FROM mcr.microsoft.com/playwright:v1.64.1-noble AS e2e
RUN npm install -g pnpm@10.17.1
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
COPY e2e/package.json e2e/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile
COPY backend backend
COPY frontend frontend
COPY contracts contracts
# The Web Push public key is read at build time (import.meta.env), so it has to be
# baked into the bundle - .dockerignore keeps every .env* out of the image, which
# rules out the usual .env.production. It must match DOPAFIT_VAPID_PUBLIC_KEY in the
# backend environment, or the push service refuses the subscription. The default keeps
# plain `docker build` working (CI builds the image without secrets); deploy.sh insists
# on a real key, and config.ts refuses a production start without one.
ARG VITE_VAPID_PUBLIC_KEY=""
RUN VITE_VAPID_PUBLIC_KEY="$VITE_VAPID_PUBLIC_KEY" \
    pnpm --filter dopafit-backend build && pnpm --filter dopafit-frontend build

FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
COPY e2e/package.json e2e/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --prod --frozen-lockfile --filter dopafit-backend

FROM node:24-slim AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/drizzle ./backend/drizzle
COPY --from=build /app/frontend/dist ./public
USER node
EXPOSE 8000
CMD ["node", "backend/dist/server.js"]
