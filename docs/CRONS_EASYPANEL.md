# Crons no EasyPanel (obrigatório em produção)

## Endpoints

| URL | Função | Intervalo sugerido |
|-----|--------|-------------------|
| `GET /api/cron/cleanup-pending` | Cancela pending &gt; ~30 min e devolve estoque | 10–15 min |
| `GET /api/cron/sync-payments` | Reconcilia pagamentos PIX/cartão | 5–10 min |

## Auth

Header:
```http
Authorization: Bearer SEU_CRON_SECRET
```

`CRON_SECRET` deve estar no **Environment** do app (não só build-arg).

## EasyPanel

1. Projeto → app `portal_lorde_next` → **Scripts** ou **Cron Jobs** (se disponível)  
2. Ou use **cron-job.org** / Uptime Robot HTTP com o header acima  
3. Exemplo URL:
   ```text
   https://portal.lordenelson.com.br/api/cron/cleanup-pending
   https://portal.lordenelson.com.br/api/cron/sync-payments
   ```

## Teste manual

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://portal.lordenelson.com.br/api/cron/cleanup-pending"
```

Admin também: dashboard → **Limpar pendentes antigos**.
