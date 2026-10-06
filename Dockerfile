# syntax=docker/dockerfile:1
#
# Two images from one file:
#   docker build --target app -t ghcr.io/kunstefix/ledgerly-demo .
#   docker build --target db  -t ghcr.io/kunstefix/ledgerly-demo-db .
#
# Demo values only. Never reuse these images with real data.

# --- db: Postgres 17 with Ledgerly's schema, seed, support views and reader role ------
FROM postgres:17 AS db
ENV POSTGRES_DB=ledgerly \
    POSTGRES_USER=ledgerly \
    POSTGRES_PASSWORD=ledgerly_demo
COPY db/schema.sql /docker-entrypoint-initdb.d/01-schema.sql
COPY db/seed.sql /docker-entrypoint-initdb.d/02-seed.sql
COPY db/support.sql /docker-entrypoint-initdb.d/03-support.sql

# --- app build ----------------------------------------------------------------------
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod --ignore-scripts

# --- app: the Ledgerly web app on port 4000 ------------------------------------------
FROM base AS app
ENV NODE_ENV=production PORT=4000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY public ./public
COPY help ./help
COPY loopback ./loopback
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
