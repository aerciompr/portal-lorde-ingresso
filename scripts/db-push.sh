#!/bin/sh
# Roda prisma db push no container EasyPanel.
# Imagem standalone só copia pedaços do Prisma — o CLI local costuma quebrar
# (ex.: Cannot find module 'effect'). Preferimos npx com versão pinada.
set -e
cd /app 2>/dev/null || true
SCHEMA="${1:-./prisma/schema.prisma}"
PRISMA_VER="${PRISMA_VERSION:-6.19.3}"

if [ -z "$DATABASE_URL" ]; then
  echo "ERRO: DATABASE_URL não está definida no ambiente do container."
  exit 1
fi

if [ ! -f "$SCHEMA" ]; then
  echo "ERRO: schema não encontrado em $SCHEMA"
  exit 1
fi

# 1) CLI local completo (incluído na imagem Docker para não depender da rede).
if [ -f ./node_modules/effect/package.json ] || [ -d ./node_modules/effect ]; then
  if [ -x ./node_modules/.bin/prisma ]; then
    echo "[db-push] Usando ./node_modules/.bin/prisma"
    exec ./node_modules/.bin/prisma db push --schema="$SCHEMA"
  fi
  if [ -f ./node_modules/prisma/build/index.js ]; then
    echo "[db-push] Usando node ./node_modules/prisma/build/index.js"
    exec node ./node_modules/prisma/build/index.js db push --schema="$SCHEMA"
  fi
fi

# 2) Fallback: npx com pacote completo (útil no desenvolvimento local).
if command -v npx >/dev/null 2>&1; then
  echo "[db-push] Baixando/usando prisma@${PRISMA_VER} via npx..."
  exec npx --yes "prisma@${PRISMA_VER}" db push --schema="$SCHEMA"
fi

echo "ERRO: npx indisponível e Prisma CLI local incompleto."
echo "Rode: npx --yes prisma@${PRISMA_VER} db push --schema=${SCHEMA}"
exit 1
