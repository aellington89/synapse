# Synapse's images, after finance-stack's (finance-stack/app/Dockerfile). The build context is
# app/, so everything an image needs lives under it. #4's part 4 adds the `build` and `runner`
# stages, for the app.

# --- Dependencies ---
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Migration job (the `migrate` service) ---
# psql and drizzle-kit, and no Next.js build. It runs app/scripts/migrate.sh, which finds its SQL
# and drizzle.config.ts from its own path, as it does in CI and a checkout.
FROM node:26-alpine AS migrate
WORKDIR /app
RUN apk add --no-cache bash postgresql18-client
COPY --from=deps /app/node_modules ./node_modules
COPY package.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY scripts ./scripts
USER node
ENTRYPOINT ["bash", "/app/scripts/migrate.sh"]
