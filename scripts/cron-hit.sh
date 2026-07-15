#!/bin/sh
# Dispara as crons do portal (use no EasyPanel Scheduled Task ou cron do host).
# Requer CRON_SECRET no ambiente do container/job.
#
# Exemplo EasyPanel (a cada 10 min):
#   sh /app/scripts/cron-hit.sh
#
set -e

SECRET="${CRON_SECRET:-$ADMIN_CRON_SECRET}"
if [ -z "$SECRET" ]; then
  echo "ERRO: CRON_SECRET não definido no Environment."
  exit 1
fi

# Preferir URL pública; dentro do container pode usar localhost
BASE="${CRON_BASE_URL:-${NEXT_PUBLIC_APP_URL:-http://127.0.0.1:3000}}"
BASE=$(echo "$BASE" | sed 's:/*$::')

echo "[cron-hit] BASE=$BASE"
echo "[cron-hit] $(date -u +%Y-%m-%dT%H:%M:%SZ) sync-payments..."
curl -sS -m 120 -H "Authorization: Bearer ${SECRET}" \
  "${BASE}/api/cron/sync-payments" || echo "sync falhou"

echo ""
echo "[cron-hit] cleanup-pending..."
curl -sS -m 120 -H "Authorization: Bearer ${SECRET}" \
  "${BASE}/api/cron/cleanup-pending" || echo "cleanup falhou"

echo ""
echo "[cron-hit] ok"
