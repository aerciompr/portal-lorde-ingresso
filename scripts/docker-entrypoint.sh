#!/bin/sh
# Garante pasta de uploads gravável (volumes EasyPanel costumam ser root:root)
set -e

UPLOADS_DIR="${UPLOADS_DIR:-/app/data/uploads}"
mkdir -p "$UPLOADS_DIR" /app/public/uploads /tmp/lordenelson-uploads
chmod -R 777 "$UPLOADS_DIR" /app/public/uploads /tmp/lordenelson-uploads 2>/dev/null || true

export UPLOADS_DIR

echo "[entrypoint] UPLOADS_DIR=$UPLOADS_DIR uid=$(id -u) PRISMA_USE_ADAPTER=${PRISMA_USE_ADAPTER:-unset}"

exec node server.js
