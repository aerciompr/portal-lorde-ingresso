#!/bin/sh
# Garante pasta de uploads gravável + sobe o server standalone do Next
set -e

UPLOADS_DIR="${UPLOADS_DIR:-/app/data/uploads}"
mkdir -p "$UPLOADS_DIR" /app/public/uploads /tmp/lordenelson-uploads
chmod -R 777 "$UPLOADS_DIR" /app/public/uploads /tmp/lordenelson-uploads 2>/dev/null || true

export UPLOADS_DIR
# Next standalone usa HOSTNAME para bind — força 0.0.0.0 (não o hostname do container)
export HOSTNAME="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"

echo "[entrypoint] UPLOADS_DIR=$UPLOADS_DIR HOSTNAME=$HOSTNAME PORT=$PORT PRISMA_USE_ADAPTER=${PRISMA_USE_ADAPTER:-unset}"

# Preferir server standalone gerado pelo Next; fallback server.js custom
if [ -f /app/server.js ]; then
  exec node /app/server.js
fi

exec node server.js
