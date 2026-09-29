#!/bin/sh
# Aplica exclusivamente a migração de atribuição (UTM/click IDs), sem `prisma db push`.
set -e
cd /app

if [ -z "$DATABASE_URL" ]; then
  echo "ERRO: DATABASE_URL não está definida."
  exit 1
fi

exec ./node_modules/.bin/prisma db execute \
  --schema=./prisma/schema.prisma \
  --file=./scripts/sql-add-marketing-attribution.sql
