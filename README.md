# Lorde Nelson Ingressos — Portal de Vendas

Aplicação **Next.js 16** de venda de ingressos do Lorde Nelson Rest Pub (Maceió-AL). Substitui o fluxo lento WordPress + WooCommerce.

| | |
|--|--|
| **Produção** | https://portal.lordenelson.com.br |
| **GitHub** | https://github.com/aerciompr/portal-lorde-ingresso |
| **VPS / EasyPanel** | `151.243.33.241` |
| **Path local** | `C:\Users\aerciompr\projects\lordenelson-ingressos` |

---

## Documentação (comece aqui)

| Doc | Conteúdo |
|-----|----------|
| **[`docs/HANDOFF_COMPLETO.md`](./docs/HANDOFF_COMPLETO.md)** | **Handoff para outra IA/DEV** — estado real, armadilhas, próximos passos |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Arquitetura, Prisma, fluxos de pagamento, mapa de pastas |
| [`docs/DEPLOY_RAPIDO.md`](./docs/DEPLOY_RAPIDO.md) | **Deploy rápido** (imagem GHCR, sem build no VPS) |
| [`docs/DEPLOY_EASYPANEL.md`](./docs/DEPLOY_EASYPANEL.md) | Deploy EasyPanel (oficial) |
| [`docs/GO_LIVE_CHECKLIST.md`](./docs/GO_LIVE_CHECKLIST.md) | Checklist go-live |
| [`docs/README.md`](./docs/README.md) | Índice de toda a pasta `docs/` |
| [`PRODUCTION_SETUP.md`](./PRODUCTION_SETUP.md) | Gateways, webhooks, crons |
| [`.env.example`](./.env.example) | Variáveis de ambiente |
| [`AGENTS.md`](./AGENTS.md) | Regras para agentes de IA |

---

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind 4 + React 19  
- **Prisma 6 + MySQL** (adapter MariaDB em `lib/prisma.ts`)  
- **Mercado Pago** (PIX) + **Stripe** (cartão)  
- PDF/QR (`pdf-lib`, `qrcode`) com HMAC (`TICKET_SECRET`)  
- E-mail: **Resend**  
- Deploy: **Docker** (`Dockerfile`, Node 22) no **EasyPanel**

> Node.js **≥ 20.9** (preferir 22). Nixpacks com Node 18 **quebra** o build.

---

## Funcionalidades

- Portal público: home, programação, evento com **lotes**, checkout, meus ingressos, PDF  
- Admin: eventos, lotes (virada auto/manual), pedidos, estorno, ferramentas, layout de ingresso, relatórios, configurações  
- Check-in com câmera + código manual  
- Webhooks + polling PIX + crons (sync / cleanup pending)  
- Virada de lote ao esgotar; finalize paid → QR + e-mail  

Detalhes de fluxo: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## Desenvolvimento local

```bash
cd C:\Users\aerciompr\projects\lordenelson-ingressos
cp .env.example .env
# preencher DATABASE_URL (MySQL), TICKET_SECRET, ADMIN_*, etc.

npm install
npx prisma generate --schema=./prisma/schema.prisma
npx prisma db push --schema=./prisma/schema.prisma
npm run dev
```

- App: http://localhost:3000  
- Admin: `/admin/login` (`ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env`)  

Seed opcional (apaga eventos/pedidos e cria demos):

```bash
npx --yes tsx prisma/seed.ts
```

---

## Produção (EasyPanel)

1. DNS: registro **A** `portal` → `151.243.33.241`  
2. Serviço **MySQL** + serviço **App** (GitHub + **Builder = Dockerfile**)  
3. Env sem aspas; `DATABASE_URL` com host = **nome do serviço MySQL** (não `localhost`)  
4. Após deploy: no console do container  
   `npx prisma db push --schema=./prisma/schema.prisma`  
5. Domínio + HTTPS no EasyPanel  
6. Webhooks e crons — ver `docs/DEPLOY_EASYPANEL.md`

**Atualizar após `git push`:** EasyPanel → Deploy. Se schema mudou, `db push` de novo.

---

## Estrutura (destaques)

```text
app/           # UI App Router + API routes
lib/           # domínio: prisma, finalize-paid-order, lote-virada, PDF, auth
prisma/        # schema MySQL + seed
Dockerfile     # build produção Node 22
server.js      # entry: bind 0.0.0.0:PORT
docs/          # documentação completa
```

---

## Segurança

- **Nunca** commitar `.env`, chaves live ou dumps  
- `TICKET_SECRET` estável em produção (trocar invalida QRs)  
- Preferir env no EasyPanel + Admin → Configurações para gateways  

---

## Status deploy (2026-07-10)

| Item | Status |
|------|--------|
| Build Docker no EasyPanel | OK |
| Schema MySQL sincronizado | OK |
| App Next em HTTPS no VPS | OK (confirmar DNS local se cache antigo) |
| Crons + webhooks live + smoke compra | A validar / configurar |

Continuidade detalhada: **[`docs/HANDOFF_COMPLETO.md`](./docs/HANDOFF_COMPLETO.md)**.
