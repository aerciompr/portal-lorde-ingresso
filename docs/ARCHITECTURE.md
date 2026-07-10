# Arquitetura — Portal Lorde Nelson Ingressos

## 1. Visão geral

Portal de **venda de ingressos** do Lorde Nelson Rest Pub (Maceió-AL), substituto do WordPress + WooCommerce.

```text
Browser
   │
   ▼
EasyPanel / Traefik (HTTPS :443)
   │
   ▼
Container App (Node 22) ──► server.js ──► Next.js 16 (App Router)
   │                              │
   │                              ├── app/* (UI + API Routes)
   │                              └── lib/* (domínio)
   │
   └──► MySQL (serviço EasyPanel, host interno = nome do serviço)
```

**URL produção:** `https://portal.lordenelson.com.br`  
**Repo:** `aerciompr/portal-lorde-ingresso`  
**Entrada de processo:** `node server.js` (bind `0.0.0.0:3000`) — **não** usar `HOSTNAME` do Linux (conflita com cPanel/containers).

---

## 2. Stack

| Camada | Tecnologia |
|--------|------------|
| Framework | Next.js **16.2** (App Router, webpack build) |
| Linguagem | TypeScript |
| UI | React 19, Tailwind 4, Tiptap (rich text), Recharts, Lucide |
| ORM | Prisma 6 + **MySQL** |
| Driver DB | `@prisma/adapter-mariadb` + `mariadb` / `mysql2` (`lib/prisma.ts`) |
| Pagamentos | Mercado Pago (PIX) + Stripe (cartão / Connect) |
| Ingressos | `pdf-lib` + `qrcode` + HMAC (`TICKET_SECRET`) |
| E-mail | Resend |
| Auth admin | Cookie `admin_session` + `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| Deploy | Docker multi-stage (`Dockerfile`) no EasyPanel |
| Node | ≥ 20.9 (engines + `nixpacks.toml` nodejs_22 + image 22) |

---

## 3. Modelos de dados (Prisma)

Arquivo: `prisma/schema.prisma` — **provider: mysql**.

| Model | Papel |
|-------|--------|
| `Event` | Evento (slug, data, cancelamento, `footerNotice`, lotes) |
| `Lote` | Lote de preço/quantidade; virada automática; `ativo` |
| `TicketType` | Tipo de ingresso (legado + compatibilidade com tickets) |
| `Order` | Pedido: pending/paid/cancelled/refunded, fees, accessCode |
| `Ticket` | QR `uniqueCode` + `qrPayload` assinado; status valid/used/cancelled |
| `CancellationRequest` | Pedido de cancelamento pelo cliente |
| `Setting` | KV no DB (chaves gateways, fees, `public_url`, etc.) |

### Lotes

- Evento tem `activeLoteId` e lista `lotes[]`.
- Venda pública usa o **lote ativo** (nome + preço).
- `lib/lote-virada.ts`: esgota lote, ativa próximo; chamada após `finalizePaidOrder`.
- Admin: virar manual, update, delete (bloqueado se houver vendas).

### Settings (duas camadas)

1. **Env** (`process.env`) — prioridade em vários campos sensíveis  
2. **Tabela `Setting`** — editável em Admin → Configurações  

Implementação: `lib/settings.ts` + cache com bust no save.

---

## 4. Fluxos críticos

### 4.1 Compra + pagamento

```text
/evento/[slug]  TicketSelector
       │
       ▼
POST /api/orders/create   → Order pending + reserva stock
       │
       ▼
/checkout/[orderId]
       │
       ├─ PIX  → POST /api/orders/pay → MP preference/payment
       │            │
       │            ├─ Webhook /api/webhook/mercadopago
       │            └─ Poll GET /api/orders/[id]/payment-status (checkout ~3s)
       │
       └─ Cartão → Stripe PaymentIntent + webhook /api/webhook/stripe
                    │
                    ▼
           finalizePaidOrder(orderId)
                    │
                    ├─ status=paid, fees, accessCode
                    ├─ QR assinado nos tickets
                    ├─ e-mail Resend
                    └─ performAutomaticVirada(eventId)
```

**Arquivo central:** `lib/finalize-paid-order.ts` — idempotente se já `paid`.

### 4.2 Crons (automação)

| Rota | Função | Sugestão schedule |
|------|--------|-------------------|
| `/api/cron/sync-payments` | Reconcilia PIX pending com MP | `*/5 * * * *` |
| `/api/cron/cleanup-pending` | Expira pending e devolve stock | `*/15 * * * *` |

Auth: header `Authorization: Bearer $CRON_SECRET` (ou query conforme implementação).  
Config Vercel: `vercel.json`. No EasyPanel: cron externo ou job HTTP.

### 4.3 Admin

- Login: `/admin/login` → cookie  
- Middleware / layout protege `/admin/*` e `/checkin`  
- Ferramentas: cortesia, pedido manual, limpeza pending  
- Layout PDF ingresso + preview  
- Estorno: `/api/admin/refund`

### 4.4 Cliente

- `/ingressos` — lookup email/CPF/código  
- PDF: `/api/tickets/[ticketId]/pdf`  
- Cancelamento: `/api/cancellations` (regras por evento)

### 4.5 Check-in

- `/checkin` — câmera (html5-qrcode) + código manual  
- API: `/api/checkin/validate` (admin cookie ou API key)

---

## 5. Mapa de pastas

```text
app/
  page.tsx, eventos/, evento/[slug]/   # público
  checkout/[orderId]/, ingressos/
  checkin/
  admin/                               # painel
  api/                                 # route handlers
  uploads/[[...slug]]/                 # servir uploads locais
components/                            # Header, RichTextEditor, EventImage
lib/
  prisma.ts                 # client + adapter MariaDB
  finalize-paid-order.ts
  lote-virada.ts
  order-stock.ts            # createAdminOrder, cleanupPending, release stock
  generate-ticket.ts        # PDF
  validate-ticket.ts        # HMAC QR
  settings.ts, email.ts, auth.ts, masks.ts, utils.ts
prisma/
  schema.prisma
  seed.ts                   # demo (requer tsx; apaga dados!)
  cpanel-init.sql           # fallback SQL legado
scripts/
  postinstall-prisma.js
  db-push-cpanel.js
  test-mysql.js
Dockerfile, nixpacks.toml, server.js, .node-version
docs/                       # esta pasta
```

---

## 6. Deploy (resumo)

| Ambiente | Como |
|----------|------|
| **Produção (oficial)** | EasyPanel + Dockerfile + MySQL service — ver `DEPLOY_EASYPANEL.md` |
| Local | `npm i` → `.env` → `prisma db push` → `npm run dev` |
| cPanel | **Abandonado** por limites (EAGAIN, CageFS, Prisma binary) — docs legadas só referência |

### Build Docker

1. `npm ci` (postinstall pode falhar sem `scripts/` no stage deps — ok com `|| true`)  
2. `prisma generate` + `next build --webpack`  
3. Runtime: `node server.js` como user `nextjs`  

Placeholders de `DATABASE_URL` no build são fake; **não** esperam MySQL no build.  
Páginas que consultam DB no SSG podem logar `pool timeout` no build — o build ainda completa se as rotas forem resilientes / dinâmicas.

---

## 7. Segurança (mínimo)

- Nunca commitar `.env` ou chaves live  
- `TICKET_SECRET` estável em produção (trocar invalida QRs antigos)  
- Admin password forte; cookie sem store de sessão server-side  
- Webhooks validam assinatura (Stripe secret; MP conforme token)  
- Uploads em `public/uploads` — em multi-réplica/serverless é efêmero (preferir URL externa estável)  
- CPF/telefone mascarados no front (`lib/masks.ts`)

---

## 8. Convenções de código

- Preços sempre em **centavos** (`priceCents`, `totalCents`)  
- Display BRL: `formatPrice` / `parseBRLToCents` em `lib/utils.ts`  
- pt-BR no UI e mensagens de API  
- Rotas admin e APIs mutáveis: preferir `dynamic = 'force-dynamic'` quando usam Prisma em request time  
- Após mudar schema: `npx prisma db push --schema=./prisma/schema.prisma` no **container** de prod

---

## 9. Limitações conhecidas

| Item | Nota |
|------|------|
| Seed em produção | `tsx` não está na imagem; `npx --yes tsx prisma/seed.ts` ou criar eventos no admin. Seed **apaga** orders/events. |
| Prisma EACCES no container | User `nextjs` sem write em `.prisma` gerado no build; `db push` sync OK; aviso de unlink pode ser ignorado. |
| DNS cache local | ISP/PC pode cachear IP antigo cPanel `177.136.254.36`; público já `151.243.33.241`. |
| WebP no PDF | Preferir JPG/PNG na arte do ingresso |
| OAuth multi-seller MP | Não implementado; só Access Token + webhook |
| Upload multi-instância | Disco local do container não é shared storage |

---

## 10. Testes manuais prioritários

1. Home + listagem eventos  
2. Compra PIX → paid automático (webhook ou poll)  
3. PDF + QR + check-in  
4. Virada de lote ao esgotar  
5. Cron cleanup pending  
6. Admin login + criar evento/lote  
