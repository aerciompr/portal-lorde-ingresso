# Handoff da sessão de desenvolvimento — Lorde Nelson Ingressos

**Projeto oficial:** `C:\Users\aerciompr\projects\lordenelson-ingressos`  
**Data do handoff:** 2026-07-09  
**Objetivo de deploy:** subdomínio HTTPS (ex.: `ingressos.lordenelson.com.br`)

Este arquivo consolida o trabalho da sessão de desenvolvimento (contexto que estava em workspace/system32 + projeto local) para o repositório oficial.

---

## 1. O que o sistema faz hoje

Portal Next.js 16 de venda de ingressos do Lorde Nelson Rest Pub:

| Área | Rotas / recursos |
|------|------------------|
| Público | `/`, `/eventos`, `/evento/[slug]`, `/checkout/[orderId]`, `/ingressos` |
| Admin | `/admin`, eventos, pedidos, **ferramentas**, **layout ingresso**, relatórios, configurações |
| Check-in | `/checkin` (staff, cookie admin) |
| Pagamentos | Stripe (cartão + Connect OAuth), Mercado Pago PIX |
| Automação | Webhooks + polling PIX + crons de limpeza/sync + virada de lote |

---

## 2. Entregas principais desta sessão (resumo)

### Pagamentos & automação
- PIX MP com payload correto (`phone.area_code` / `number`), guards de chaves e HTTPS
- URL pública configurável no admin (`public_url`) para webhooks/ngrok
- `finalizePaidOrder`: paid → QR assinado → e-mail → virada de lote
- Webhooks Stripe/MP reforçados; polling `/api/orders/[id]/payment-status` (3s no checkout)
- Crons: `cleanup-pending` (15 min), `sync-payments` (5 min) em `vercel.json`
- Virada automática de lote ao esgotar; virada manual marca lote anterior **ESGOTADO**

### Admin / ops
- Ferramentas: cortesia, pedido manual, limpeza de pending
- Layout do ingresso + download PDF de exemplo e PDF por pedido pago
- Imagem do evento no PDF (PNG/JPG)
- Delete seguro de lotes/tipos (`/api/admin/lotes/delete`) com bloqueio se houver vendas
- UI Eventos: botões reorganizados; colunas Capacidade / Vendidos / Estoque

### UX público
- Editor rich text (Tiptap) + CSS `.event-description` (listas no site)
- Moeda BRL (`formatPrice`, `parseBRLToCents`)
- Sem contagem de “disponíveis” no público
- Compra por **nome de lote** + histórico esgotado (não “Ingresso Padrão”)
- Aviso legal padrão no fim da descrição (+ campo opcional `footerNotice`)

### Infra / qualidade
- Hydration admin layout corrigido
- `export const dynamic = 'force-dynamic'` em páginas com Recharts
- Cache de settings com bust no save admin

---

## 3. Arquivos-chave novos / críticos

```
lib/finalize-paid-order.ts
lib/lote-virada.ts
lib/order-stock.ts
lib/generate-ticket.ts
app/api/cron/cleanup-pending/route.ts
app/api/cron/sync-payments/route.ts
app/api/orders/[orderId]/payment-status/route.ts
app/api/admin/orders/manual/route.ts
app/api/admin/lotes/delete/route.ts
app/api/admin/ticket-preview-pdf/route.ts
app/admin/ferramentas/page.tsx
app/admin/ingresso-preview/page.tsx
vercel.json
.env.example
docs/DEPLOY_SUBDOMAIN.md
```

---

## 4. Variáveis obrigatórias em produção

Ver `.env.example` e `docs/DEPLOY_SUBDOMAIN.md`.

Mínimo:
- `NEXT_PUBLIC_APP_URL` = HTTPS do subdomínio
- `DATABASE_URL` = MySQL/Postgres de produção
- `TICKET_SECRET`, `ADMIN_PASSWORD`, `CRON_SECRET`
- `RESEND_API_KEY` (e-mail)
- Chaves Stripe e/ou MP **live**
- Webhooks apontando para o subdomínio

---

## 5. Banco de dados

- **Dev local:** Prisma `provider = "sqlite"` + `file:./prisma/dev.db`
- **Produção:** alterar `prisma/schema.prisma` para `provider = "mysql"` (ou postgres), apontar `DATABASE_URL`, rodar `npx prisma db push` ou migrate

Campos relevantes recentes:
- `Event.footerNotice`
- Settings: `public_url`, `pending_order_ttl_minutes`

---

## 6. Pós-deploy checklist (manual)

1. [ ] DNS subdomínio → Vercel/host
2. [ ] Env vars no painel do host
3. [ ] `prisma generate` + `db push` no banco de prod
4. [ ] Webhook MP: `https://SUB/api/webhook/mercadopago`
5. [ ] Webhook Stripe: `https://SUB/api/webhook/stripe` + `STRIPE_WEBHOOK_SECRET`
6. [ ] Admin → Gateways: chaves + URL pública = subdomínio
7. [ ] Crons Vercel ativos (plano com Cron) ou agendador externo + `CRON_SECRET`
8. [ ] Compra teste PIX + cartão valor mínimo
9. [ ] E-mail Resend com domínio verificado
10. [ ] Trocar senha admin padrão

---

## 7. Limitações conhecidas / próximos passos opcionais

- OAuth “Conectar conta” Mercado Pago (multi-seller) **não** implementado — só chaves + webhook
- WebP no PDF do ingresso pode falhar (preferir JPG/PNG)
- Upload de imagens em serverless (Vercel): `/public/uploads` é efêmero — considerar S3/Blob em prod
- README ainda menciona simulação antiga em partes — ver docs de deploy para fluxo real

---

## 8. Comandos úteis

```bash
cd C:\Users\aerciompr\projects\lordenelson-ingressos
npm install
npx prisma generate
npx prisma db push
npm run build
npm run start
# ou: npm run dev
```

Testar cron local:
```bash
curl "http://localhost:3000/api/cron/cleanup-pending"
curl "http://localhost:3000/api/cron/sync-payments"
```
