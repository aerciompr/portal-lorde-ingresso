# Crons em produção (EasyPanel)

## O que as crons **não** são

A pasta `scripts/` **não agenda nada sozinha**.  
Só existem **rotas HTTP** que precisam ser chamadas periodicamente.

| Endpoint | Função | Intervalo |
|----------|--------|-----------|
| `GET /api/cron/sync-payments` | Confirma PIX/cartão pending no gateway | 5–10 min |
| `GET /api/cron/cleanup-pending` | Cancela pending antigos + devolve estoque | 10–15 min |

---

## 1) Variável obrigatória

No serviço do app no EasyPanel → **Environment**:

```env
CRON_SECRET=uma_string_longa_e_aleatoria
```

Salve e **reinicie** o app (senão o process não vê a var).

Sem `CRON_SECRET` em produção, a URL responde **401 Unauthorized**.

---

## 2) Opção A — cron-job.org (mais fácil)

1. Conta em [https://cron-job.org](https://cron-job.org)  
2. Create cron job:

**Job 1 — sync (a cada 5–10 min)**  
- URL: `https://portal.lordenelson.com.br/api/cron/sync-payments`  
- Request method: GET  
- Header: `Authorization` = `Bearer SEU_CRON_SECRET`  

**Job 2 — cleanup (a cada 15 min)**  
- URL: `https://portal.lordenelson.com.br/api/cron/cleanup-pending`  
- Header: `Authorization` = `Bearer SEU_CRON_SECRET`  

3. Ative e veja o histórico de execução (deve retornar JSON `success: true`).

---

## 3) Opção B — EasyPanel / shell no host

Se o EasyPanel tiver **Cron / Scheduled tasks** no container:

```bash
# dentro do container (CRON_SECRET já no env)
sh /app/scripts/cron-hit.sh
```

Ou no crontab do host:

```cron
*/10 * * * * curl -sS -m 120 -H "Authorization: Bearer SEU_CRON_SECRET" "https://portal.lordenelson.com.br/api/cron/sync-payments" >/dev/null 2>&1
*/15 * * * * curl -sS -m 120 -H "Authorization: Bearer SEU_CRON_SECRET" "https://portal.lordenelson.com.br/api/cron/cleanup-pending" >/dev/null 2>&1
```

---

## 4) Opção C — sem cron externo (manual)

No admin (logado como admin):

- **Dashboard → “Rodar crons agora”**  
  ou  
- **Pedidos → “Rodar crons agora”**

Isso **não depende** de `CRON_SECRET`. Roda sync Stripe/PIX + limpeza + viradas.

TTL de pending: **Admin → Configurações → Regras → “Expirar pending (min)”** (padrão 30).

---

## 5) Teste no terminal

```bash
curl -sS -H "Authorization: Bearer SEU_CRON_SECRET" \
  "https://portal.lordenelson.com.br/api/cron/cleanup-pending"
```

Respostas:

| JSON | Significado |
|------|-------------|
| `{"success":true,...}` | OK |
| `{"error":"Unauthorized"}` | Secret errado ou não está no env do container |
| `Nenhum pending com mais de X min` | Cron OK, só não havia pedido velho o bastante |

Query opcional: `?secret=SEU_CRON_SECRET` se o agendador não mandar header.

---

## 6) Checklist

- [ ] `CRON_SECRET` no Environment do app  
- [ ] Redeploy / restart após criar a var  
- [ ] Job HTTP a cada 5–15 min **ou** uso manual do botão  
- [ ] Teste `curl` retorna `success: true`  
- [ ] Admin → Dashboard mostra “última execução” após rodar  

## Por que “não limpava”

1. Cron nunca era chamado (só script no repo não agenda).  
2. `CRON_SECRET` ausente → 401.  
3. Pending com **menos** de 15–30 min → não entra no cleanup (é esperado).  
4. Botão admin precisa estar logado e clicar em **Rodar crons** / limpeza em **Ferramentas**.
