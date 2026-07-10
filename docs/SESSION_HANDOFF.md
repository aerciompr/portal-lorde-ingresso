# Handoff da sessão de features — Lorde Nelson Ingressos

**Projeto oficial:** `C:\Users\aerciompr\projects\lordenelson-ingressos`  
**Data original:** 2026-07-09  
**Atualização deploy:** 2026-07-10  

> **Para continuidade completa (IA/DEV + produção EasyPanel), use:**  
> **[`HANDOFF_COMPLETO.md`](./HANDOFF_COMPLETO.md)** e **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

Este arquivo mantém o resumo da sessão de **features** (pagamentos, lotes, admin). O estado de **infra** está no handoff completo.

---

## 1. O que o sistema faz

Portal Next.js 16 de venda de ingressos do Lorde Nelson Rest Pub:

| Área | Rotas / recursos |
|------|------------------|
| Público | `/`, `/eventos`, `/evento/[slug]`, `/checkout/[orderId]`, `/ingressos` |
| Admin | `/admin`, eventos, pedidos, ferramentas, layout ingresso, relatórios, configurações |
| Check-in | `/checkin` (staff, cookie admin) |
| Pagamentos | Stripe (cartão + Connect OAuth), Mercado Pago PIX |
| Automação | Webhooks + polling PIX + crons limpeza/sync + virada de lote |

**URL produção:** `https://portal.lordenelson.com.br`  
**Repo:** https://github.com/aerciompr/portal-lorde-ingresso  

---

## 2. Entregas principais (features)

### Pagamentos & automação
- PIX MP com payload correto (`phone.area_code` / `number`), guards de chaves e HTTPS  
- URL pública configurável no admin (`public_url`) para webhooks/ngrok  
- `finalizePaidOrder`: paid → QR assinado → e-mail → virada de lote  
- Webhooks Stripe/MP; polling `/api/orders/[id]/payment-status` (~3s no checkout)  
- Crons: `cleanup-pending`, `sync-payments`  
- Virada automática de lote ao esgotar; manual marca anterior **ESGOTADO**  

### Admin / ops
- Ferramentas: cortesia, pedido manual, limpeza de pending  
- Layout do ingresso + PDF preview  
- Delete seguro de lotes (`/api/admin/lotes/delete`) se sem vendas  
- UI eventos: capacidade / vendidos / estoque  

### UX público
- Rich text (Tiptap) + `.event-description`  
- BRL (`formatPrice`, `parseBRLToCents`)  
- Compra por **nome de lote**  
- Aviso legal (`footerNotice` / default)  

### Infra (2026-07-10)
- Schema Prisma **MySQL**  
- Dockerfile Node 22 + EasyPanel  
- cPanel abandonado (limites shared host)  
- `server.js` bind `0.0.0.0` (sem `HOSTNAME` do OS)  

---

## 3. Arquivos-chave

```text
lib/finalize-paid-order.ts
lib/lote-virada.ts
lib/order-stock.ts
lib/generate-ticket.ts
lib/prisma.ts
app/api/cron/cleanup-pending/route.ts
app/api/cron/sync-payments/route.ts
app/api/orders/[orderId]/payment-status/route.ts
app/api/admin/orders/manual/route.ts
app/api/admin/lotes/delete/route.ts
Dockerfile
server.js
nixpacks.toml
docs/HANDOFF_COMPLETO.md
docs/DEPLOY_EASYPANEL.md
```

---

## 4. Variáveis de produção

Ver `.env.example` e `DEPLOY_EASYPANEL.md`.

Mínimo: `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `TICKET_SECRET`, `ADMIN_*`, `CRON_SECRET`, Resend, Stripe e/ou MP live, webhooks no domínio do portal.

---

## 5. Banco

- **Produção / schema atual:** `provider = "mysql"`  
- Sync: `npx prisma db push --schema=./prisma/schema.prisma`  
- Campos relevantes: `Event.footerNotice`, lotes, `Setting.public_url`, fees  

---

## 6. Limitações / próximos

- Crons e webhooks live a validar em EasyPanel  
- Seed precisa de `tsx` (não na imagem) — preferir admin  
- WebP no PDF: preferir JPG/PNG  
- Uploads locais no container são efêmeros multi-réplica  
- OAuth multi-seller MP não implementado  

---

## 7. Comandos

```bash
cd C:\Users\aerciompr\projects\lordenelson-ingressos
npm install
npx prisma generate --schema=./prisma/schema.prisma
npx prisma db push --schema=./prisma/schema.prisma
npm run build
npm start
# dev: npm run dev
```
