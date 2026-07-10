# EasyPanel / Docker — Portal Lorde Nelson Ingressos
# Build: GitHub → App service no EasyPanel

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Placeholders só para o build (valores reais vêm do EasyPanel em runtime)
ENV DATABASE_URL="mysql://build:build@127.0.0.1:3306/build"
ENV TICKET_SECRET="build-placeholder-ticket-secret-min-32-chars"
ENV NEXT_PUBLIC_APP_URL="https://portal.lordenelson.com.br"

RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npm run build

# ---- run ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOST=0.0.0.0
ENV PORT=3000
# Pasta de uploads (sobrescreva com volume EasyPanel se quiser persistir entre deploys)
ENV UPLOADS_DIR=/app/public/uploads

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.ts ./next.config.ts

# Upload de imagens no admin: user nextjs precisa gravar aqui (senão EACCES)
RUN mkdir -p /app/public/uploads \
  && chown -R nextjs:nodejs /app/public/uploads \
  && chmod 775 /app/public/uploads

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
