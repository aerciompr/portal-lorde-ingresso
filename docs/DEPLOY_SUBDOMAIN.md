# Deploy em subdomínio (produção)

Guia para subir o **Lorde Nelson Ingressos** em um subdomínio HTTPS, por exemplo:

`https://ingressos.lordenelson.com.br`

---

## 1. Pré-requisitos

- Conta [Vercel](https://vercel.com) (recomendado) **ou** Node 20+ em VPS
- Domínio com acesso ao DNS
- Banco **MySQL** ou **PostgreSQL** gerenciado (não use SQLite em produção)
- Contas: Stripe, Mercado Pago, Resend

---

## 2. DNS do subdomínio

No provedor do domínio (`lordenelson.com.br`):

| Tipo | Nome | Valor |
|------|------|--------|
| CNAME | `ingressos` | `cname.vercel-dns.com` (ou o indicado pela Vercel) |

Aguarde propagação (minutos a poucas horas). Ative HTTPS (automático na Vercel).

---

## 3. Banco de produção

1. Crie um database (Railway, Aiven, PlanetScale, RDS, etc.).
2. No `prisma/schema.prisma`, para produção use:

```prisma
datasource db {
  provider = "mysql"   // ou "postgresql"
  url      = env("DATABASE_URL")
}
```

3. `DATABASE_URL` exemplo MySQL:

```
mysql://USER:PASS@HOST:3306/lordenelson_ingressos?sslaccept=strict&connection_limit=5
```

4. Aplique o schema:

```bash
npx prisma generate
npx prisma db push
# opcional seed só se quiser dados demo (NÃO em prod real):
# npm run db:seed
```

> Em dev local você pode manter `provider = "sqlite"`. Antes do deploy de prod, altere para `mysql`/`postgresql` e faça push no banco remoto.

---

## 4. Variáveis de ambiente (Vercel → Settings → Environment Variables)

Copie de `.env.example`. **Obrigatórias:**

```
NEXT_PUBLIC_APP_URL=https://ingressos.lordenelson.com.br
DATABASE_URL=...
TICKET_SECRET=...          # 64 hex, gerado uma vez
ADMIN_EMAIL=admin@...
ADMIN_PASSWORD=...         # forte; sem default em prod
CRON_SECRET=...
RESEND_API_KEY=re_...
FROM_EMAIL=ingressos@...   # domínio verificado no Resend

STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_PUBLIC_KEY=APP_USR-...
```

Gere segredos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 5. Deploy Vercel

```bash
# no diretório do projeto
npx vercel
# produção:
npx vercel --prod
```

Ou: GitHub → import project → Root = repo → Build `next build` → Output default.

**Project Settings**
- Framework: Next.js
- Install: `npm install`
- Build: `prisma generate && next build`  
  (ou use o script `npm run build` abaixo)

Após o domínio customizado:
- Project → Domains → adicione `ingressos.lordenelson.com.br`

---

## 6. Webhooks (crítico para automação)

### Mercado Pago
1. [Developers → Sua app → Webhooks](https://www.mercadopago.com.br/developers/panel/app)
2. Produção:  
   `https://ingressos.lordenelson.com.br/api/webhook/mercadopago`
3. Eventos de **Pagamentos**
4. Admin do portal → Configurações → Gateways: Access Token + **URL Pública** = `https://ingressos.lordenelson.com.br`

### Stripe
1. Dashboard → Developers → Webhooks  
2. Endpoint:  
   `https://ingressos.lordenelson.com.br/api/webhook/stripe`  
3. Eventos: `payment_intent.succeeded`, `charge.refunded`  
4. Copie o signing secret → `STRIPE_WEBHOOK_SECRET`

---

## 7. Crons (automação)

`vercel.json` já define:

| Path | Schedule | Função |
|------|----------|--------|
| `/api/cron/cleanup-pending` | */15 * * * * | Pending abandonados → estoque |
| `/api/cron/sync-payments` | */5 * * * * | Sync PIX + virada de lote |

Na Vercel, crons precisam de plano que suporte Cron Jobs.  
Auth: `Authorization: Bearer $CRON_SECRET` (a Vercel injeta se configurado; o código também aceita `?secret=`).

Alternativa externa (cron-job.org):

```
GET https://ingressos.../api/cron/sync-payments
Header: Authorization: Bearer SEU_CRON_SECRET
```

---

## 8. Uploads de imagem

Em **Vercel serverless**, arquivos gravados em `public/uploads` **não persistem** entre deploys/instâncias.

Opções:
1. **Curto prazo:** URLs externas (CDN, WordPress atual, Cloudinary)
2. **Recomendado:** S3 / Vercel Blob / Cloudflare R2 e salvar a URL no `imageUrl`

O campo de imagem do evento já aceita URL.

---

## 9. Checklist pós-subida

- [ ] `https://ingressos...` abre a home
- [ ] Login admin com senha forte
- [ ] Criar/editar evento + lote
- [ ] Compra PIX (valor real mínimo ou sandbox)
- [ ] Status no checkout muda sozinho após pagar
- [ ] E-mail de confirmação chega
- [ ] PDF do ingresso com QR + poster (JPG/PNG)
- [ ] Check-in lê o QR
- [ ] Virada de lote ao esgotar (teste com qtd baixa)
- [ ] Webhooks com 200 no dashboard MP/Stripe

---

## 10. VPS (alternativa à Vercel)

```bash
git clone ...
cd lordenelson-ingressos
cp .env.example .env   # editar
npm ci
# schema provider = mysql
npx prisma generate && npx prisma db push
npm run build
npm run start          # porta 3000
# nginx/caddy reverse proxy + SSL (Let's Encrypt) no subdomínio
```

Agende crons no sistema:

```cron
*/5 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://ingressos.../api/cron/sync-payments
*/15 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://ingressos.../api/cron/cleanup-pending
```

---

## 11. Rollback

- Vercel: Promote deployment anterior  
- Banco: backups do provedor MySQL antes de `db push` grandes  

---

## Documentos relacionados

- `docs/SESSION_HANDOFF.md` — o que foi feito na sessão  
- `PRODUCTION_SETUP.md` — chaves e detalhes de gateways  
- `.env.example` — template de variáveis  
