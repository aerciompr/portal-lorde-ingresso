# EasyPanel / Docker — build OTIMIZADO
# - standalone (não copia node_modules inteiro → export bem mais rápido)
# - DOCKER_BUILD=1: sem tsc no build (~3 min a menos)
# - cache npm (BuildKit)
# - deps só reconstroem se package-lock mudar

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---- deps (cache por package-lock) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---- build ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts ./scripts
# resto do código (muda com frequência — depois das deps)
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DOCKER_BUILD=1
ENV DATABASE_URL="mysql://build:build@127.0.0.1:3306/build"
ENV TICKET_SECRET="build-placeholder-ticket-secret-min-32-chars"
ENV NEXT_PUBLIC_APP_URL="https://portal.lordenelson.com.br"

RUN npx prisma generate --schema=./prisma/schema.prisma \
 && npm run build

# ---- run (imagem enxuta) ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOST=0.0.0.0
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV UPLOADS_DIR=/app/data/uploads
# disk = pasta no container (monte VOLUME EasyPanel em /app/data/uploads)
# db = MySQL MediaFile (alternativa sem volume)
ENV UPLOAD_STORAGE=disk
ENV PRISMA_USE_ADAPTER=0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone: app + deps mínimas (sem copiar 500MB de node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma (client + engines + schema) — db push no shell do container
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /app/data/uploads /app/public/uploads /tmp/lordenelson-uploads \
  && chown -R nextjs:nodejs /app/data /app/public/uploads \
  && chmod -R 775 /app/data /app/public/uploads \
  && chmod +x /app/scripts/docker-entrypoint.sh /app/scripts/db-push.sh \
  && ln -sf /app/node_modules/.bin/prisma /usr/local/bin/prisma 2>/dev/null || true

# Fuso Maceió (UTC-3) — formatação de data no Node/logs
ENV TZ=America/Maceio
ENV LANG=pt_BR.UTF-8

USER root
EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
