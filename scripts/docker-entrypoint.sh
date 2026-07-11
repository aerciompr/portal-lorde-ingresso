#!/bin/sh
# Uploads persistentes: use volume EasyPanel em /app/data/uploads
# mkdir -p NÃO apaga arquivos existentes no volume
set -e

UPLOADS_DIR="${UPLOADS_DIR:-/app/data/uploads}"
mkdir -p "$UPLOADS_DIR" /app/public/uploads
# permissão sem limpar conteúdo
chmod 777 "$UPLOADS_DIR" 2>/dev/null || true
chmod 777 /app/public/uploads 2>/dev/null || true

export UPLOADS_DIR
export HOSTNAME="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"

# Conta arquivos (ajuda a ver se o volume está vazio a cada deploy)
COUNT=$(ls -A "$UPLOADS_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo "[entrypoint] UPLOADS_DIR=$UPLOADS_DIR files=$COUNT HOSTNAME=$HOSTNAME PORT=$PORT"
if [ "$COUNT" = "0" ]; then
  echo "[entrypoint] AVISO: pasta de uploads vazia. Se isso se repete a cada deploy, monte um VOLUME em /app/data/uploads no EasyPanel (docs/UPLOADS_PERSISTENTES.md)"
fi

if [ -f /app/server.js ]; then
  exec node /app/server.js
fi

exec node server.js
