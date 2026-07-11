#!/bin/sh
# Roda prisma db push no container EasyPanel (standalone não coloca "prisma" no PATH)
set -e
cd /app 2>/dev/null || true
SCHEMA="${1:-./prisma/schema.prisma}"

if [ -z "$DATABASE_URL" ]; then
  echo "ERRO: DATABASE_URL não está definida no ambiente do container."
  exit 1
fi

if [ -x ./node_modules/.bin/prisma ]; then
  exec ./node_modules/.bin/prisma db push --schema="$SCHEMA"
fi

if [ -f ./node_modules/prisma/build/index.js ]; then
  exec node ./node_modules/prisma/build/index.js db push --schema="$SCHEMA"
fi

echo "Prisma CLI local não encontrado. Baixando via npx..."
exec npx --yes prisma@6.19.3 db push --schema="$SCHEMA"
