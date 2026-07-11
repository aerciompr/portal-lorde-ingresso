# Handoff completo — continuar o projeto (IA / DEV)

**Atualizado:** 2026-07-11  
**Objetivo:** permitir que **outra pessoa ou outra IA** retome o trabalho e a operação sem perder contexto.

Leia também: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`DEPLOY_EASYPANEL.md`](./DEPLOY_EASYPANEL.md), [`UPLOADS_PERSISTENTES.md`](./UPLOADS_PERSISTENTES.md), [`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md).

---

## 0. Novo DEV em ~1 hora (checklist)

### Acesso necessário (fora do Git — pedir ao dono)

| O quê | Onde |
|-------|------|
| Código | GitHub `aerciompr/portal-lorde-ingresso` branch `main` |
| Deploy / env / logs | EasyPanel no VPS `151.243.33.241` |
| Domínio | `https://portal.lordenelson.com.br` |
| Pagamentos | Contas Mercado Pago + Stripe (live) |
| E-mail | Resend (domínio `lordenelson.com.br` verificado) |
| Admin do portal | `/admin/login` — `ADMIN_EMAIL` / `ADMIN_PASSWORD` (env EasyPanel) |
| MySQL | Serviço no EasyPanel (host = nome do serviço, não localhost) |

**Não** existem senhas/tokens no repositório. Sem EasyPanel + env, dá para desenvolver local, **não** operar produção.

### Passos

1. Clonar repo, copiar `.env.example` → `.env`, preencher MySQL local + secrets de dev.  
2. `npm install` → `npx prisma generate` → `npx prisma db push` → `npm run dev`.  
3. Ler este arquivo + `ARCHITECTURE.md` (30 min).  
4. Abrir produção no browser; login admin; conferir Admin → Configurações (gateways, logo).  
5. EasyPanel: env completa, volume uploads, último deploy `main`.  
6. Smoke: comprar PIX teste → Meus Ingressos → PDF → e-mail → check-in.  
7. Só então mexer em código; deploy = `git push origin main` + Implantar no EasyPanel.

### O que NÃO fazer no primeiro dia

- Rodar `prisma/seed.ts` em **produção** (apaga eventos/pedidos).  
- Trocar `TICKET_SECRET` (invalida QRs antigos).  
- Apagar volume de uploads ou recriar MySQL sem backup.  
- Usar Access Token do MP como `MERCADOPAGO_WEBHOOK_SECRET`.  
- Voltar SQLite ou Node 18 no deploy.

---

## 1. Identidade do projeto

| Campo | Valor |
|-------|--------|
| Nome | Lorde Nelson Ingressos (portal de tickets) |
| Path local (Windows) | `C:\Users\aerciompr\projects\lordenelson-ingressos` |
| GitHub | https://github.com/aerciompr/portal-lorde-ingresso · branch `main` |
| Domínio prod | https://portal.lordenelson.com.br |
| VPS / EasyPanel | IP `151.243.33.241` |
| Substituí | WordPress + WooCommerce (site antigo do pub) |
| Contato público WhatsApp | `(82) 99647-1998` · `lib/contact.ts` · wa.me/5582996471998 |

---

## 2. Estado em 2026-07-11 (real)

### Produto / código

- Portal: home, programação, evento + lotes, checkout PIX/cartão, **Meus Ingressos** (shell estilo admin, carteira com capa/QR, abas Próximos / Passados / Estornos / Conta).  
- Contadores: **estornos não somam** com ingressos válidos.  
- Estorno: sem QR de entrada; PDF comprovante de estorno; estoque devolvido se lote ativo.  
- Admin: eventos, lotes, pedidos (**reenvio de e-mail** confirmação+PDF e código LN), estorno, ferramentas, layout ingresso, **relatórios Geral + Por evento**, configurações.  
- Check-in câmera + código.  
- Logo/favicon do admin; WhatsApp no header e rodapé (Font Awesome brands).  
- Rodapé com quebras de linha (`\n` / `•`).

### Segurança (importante)

| Item | Comportamento |
|------|----------------|
| `GET /api/admin/settings` público | Só branding + chaves **publishable** + taxas. **Não apaga** secrets do banco. |
| Secrets MP/Stripe no MySQL (`Setting`) | Continuam gravados; só admin logado vê no GET completo / `getAppSettings` no servidor. |
| Meus Ingressos lookup | Só **código LN** (GET) ou **e-mail/CPF + senha** (POST). Sem listar por e-mail sozinho. |
| Senha do cliente | Nunca na query string. |
| PDF ingresso | Público exige `?code=LN-…` do pedido; admin autenticado ok. |
| Sessão admin | Cookie **assinado** HMAC (`lib/auth.ts`). Cookie legado `=1` ainda aceito no deploy. |
| Proxy (borda) | `proxy.ts` protege `/admin/*` e `/checkin` (Next.js 16; não usar `middleware.ts`). |
| Link ADMIN no site | Removido do header público; acesso só `/admin/login`. |

### Infra / deploy

| Etapa | Status |
|-------|--------|
| GitHub `main` | Ativo (commits recentes: segurança, reports, resend e-mail, UX ingressos) |
| Dockerfile Node 22 | Produção |
| MySQL EasyPanel + Prisma | Em uso |
| Volume uploads | Preferir `UPLOAD_STORAGE=disk` + volume `/app/data/uploads` |
| Resend + domínio | Configurado (validar FROM_EMAIL do domínio) |
| PIX / webhooks / polling | Em uso; secret MP webhook opcional |
| Crons HTTP | Confirmar no EasyPanel se ainda pendente |

### Commits recentes de referência (main)

```text
b71fd9a  feat: admin reenvia e-mail de confirmacao (PDF) e codigo LN
11eec90  security: settings sem secrets publicos, lookup/PDF/admin session
7fd4a20  feat: relatorios geral e por evento
ce6aede  feat: Meus Ingressos shell estilo admin
3176a10  feat: WhatsApp no topo e rodape
```

---

## 3. Ambiente de produção

```text
DNS A: portal.lordenelson.com.br → 151.243.33.241

EasyPanel:
  ├── MySQL (host interno = nome do serviço, ex. chatwoot_portal_lorde)
  └── App (GitHub main + Dockerfile) porta 3000 + HTTPS
```

```text
DATABASE_URL=mysql://USER:PASS@NOME_SERVICO_MYSQL:3306/NOME_DB
```

```bash
# No console do container, se schema mudou:
npx prisma db push --schema=./prisma/schema.prisma
# Se prisma CLI ausente: npx --yes prisma@6.19.3 db push --schema=./prisma/schema.prisma
```

---

## 4. Variáveis de ambiente

Template: [`.env.example`](../.env.example). Detalhe deploy: [`DEPLOY_EASYPANEL.md`](./DEPLOY_EASYPANEL.md).

### Obrigatórias

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
NEXT_PUBLIC_APP_URL=https://portal.lordenelson.com.br
DATABASE_URL=mysql://...@servico:3306/db
TICKET_SECRET=<hex 64, NÃO trocar à toa>
ADMIN_EMAIL=...
ADMIN_PASSWORD=<forte>
# Opcional mas recomendado (assinatura cookie admin):
ADMIN_SESSION_SECRET=<string longa aleatória>
CRON_SECRET=<forte>
UPLOAD_STORAGE=disk
UPLOADS_DIR=/app/data/uploads
```

### Pagamentos / e-mail

```env
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_PUBLIC_KEY=
MERCADOPAGO_WEBHOOK_SECRET=   # do painel MP; NÃO use o Access Token
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
FROM_EMAIL=ingressos@lordenelson.com.br
```

Settings também no **Admin → Configurações** (tabela `Setting`). Servidor lê via `lib/settings.ts` (DB + fallback env).

**Webhooks:**

- `https://portal.lordenelson.com.br/api/webhook/mercadopago`
- `https://portal.lordenelson.com.br/api/webhook/stripe`

**Crons (se configurados):**

- `GET/POST /api/cron/sync-payments` — header `Authorization: Bearer CRON_SECRET`
- `GET/POST /api/cron/cleanup-pending`

---

## 5. Comandos do dia a dia

### Local

```bash
cd C:\Users\aerciompr\projects\lordenelson-ingressos
cp .env.example .env
npm install
npx prisma generate --schema=./prisma/schema.prisma
npx prisma db push --schema=./prisma/schema.prisma
npm run dev
```

### Deploy

```bash
git push origin main
# EasyPanel → App → Implantar / Deploy
# Se schema mudou: db push no container
```

### Seed (CUIDADO — apaga dados)

```bash
npx --yes tsx prisma/seed.ts
```

Em prod: criar eventos no admin.

---

## 6. Onde mexer (mapa)

| Quero… | Onde |
|--------|------|
| Meus Ingressos UI | `app/ingressos/page.tsx` |
| PDF / QR / estorno PDF | `lib/generate-ticket.ts`, `app/api/tickets/[ticketId]/pdf` |
| Confirmação / reenvio e-mail | `lib/email.ts`, `app/api/admin/orders/resend-email` |
| Finalizar pagamento | `lib/finalize-paid-order.ts` |
| Lote / estoque | `lib/lote-virada.ts`, `lib/order-stock.ts` |
| Settings públicos vs secrets | `lib/settings-public.ts`, `app/api/admin/settings` |
| Auth admin | `lib/auth.ts`, `lib/auth-edge.ts`, `proxy.ts` |
| Relatórios | `app/admin/reports`, `app/api/admin/reports` |
| Pedidos admin | `app/admin/pedidos` |
| WhatsApp / contato | `lib/contact.ts`, `components/Header.tsx`, `app/layout.tsx` |
| Deploy | `Dockerfile`, `docs/DEPLOY_EASYPANEL.md` |
| Prisma | `prisma/schema.prisma` → **db push** em prod |

### Arquivos críticos (não “otimizar” sem entender)

| Arquivo | Por quê |
|---------|---------|
| `lib/finalize-paid-order.ts` | Paid + QR + e-mail + lote |
| `lib/lote-virada.ts` | Preço/estoque lote |
| `lib/prisma.ts` | Adapter + URL limpa |
| `lib/settings.ts` | Env + DB |
| `lib/auth.ts` / `proxy.ts` | Sessão admin (borda Next 16) |
| `server.js` | Bind `0.0.0.0` |
| `Dockerfile` | Node 22 produção |

---

## 7. Fluxos de negócio (resumo)

1. **Compra:** evento → lotes → checkout → PIX (MP) ou cartão (Stripe) → webhook/poll → `finalizePaidOrder` → e-mail + PDF + código LN.  
2. **Meus Ingressos:** código LN **ou** e-mail/CPF + senha → lista pedidos → QR/PDF (PDF com `code=`).  
3. **Estorno:** admin → gateway → status refunded → sem QR; comprovante PDF; contador à parte.  
4. **Admin reenvio e-mail:** Pedidos → **E-mail** (confirmação+PDF) ou **Código** (só LN).  
5. **Relatórios:** `/admin/reports` — aba Geral e Por evento; CSV.

---

## 8. Armadilhas já resolvidas (não repetir)

| Erro | Solução |
|------|---------|
| Node 18 no EasyPanel | Dockerfile Node 22 |
| Upload EACCES | Volume + `UPLOAD_STORAGE=disk` + chown |
| Prisma description VARCHAR | LongText + SQL se preciso |
| Resend domain not verified | FROM do domínio verificado + API key certa |
| MP webhook Invalid signature | Secret certo; processar via API; Access Token ≠ webhook secret |
| Contador “2 ingressos” com 1 estorno | Contadores separados em Meus Ingressos |
| Settings públicos vazavam tokens | Filtro em `filterPublicSettings` |
| Logo sumia | Fallback `/logo-lordenelson.jpg` + fundo claro |
| Workspace IDE em System32 | Código real em `C:\Users\aerciompr\projects\lordenelson-ingressos` |

---

## 9. Próximos passos opcionais

1. Confirmar crons no EasyPanel.  
2. Validar webhooks live e um smoke PIX real.  
3. Remover compat `admin_session=1` depois que todos re-logarem.  
4. Testes automatizados (lookup, finalize, reports).  
5. Filtro de período nos relatórios.  
6. Arquivar `docs/PLANO_*.md` antigos se confundirem.  
7. Password manager compartilhado (env + logins) **fora do Git**.

---

## 10. Regras para agentes (IA)

1. Comunicação com o usuário: **pt-BR**.  
2. Não commitar segredos, `.env`, `dist-cpanel/`, dumps.  
3. Deploy preferido: **Dockerfile** EasyPanel.  
4. Schema change → lembrar **db push no container**.  
5. Não reintroduzir SQLite em prod sem decisão.  
6. Path do projeto: ver tabela §1 (não System32).  
7. Ver [`../AGENTS.md`](../AGENTS.md).

---

## 11. Contatos / credenciais

- **Git:** não guarda senhas.  
- **Operação:** EasyPanel Environment + password manager do dono.  
- **GitHub:** conta `aerciompr`.  
- **WhatsApp casa:** ver `lib/contact.ts`.

---

## 12. Se você é uma IA lendo isto agora

1. Leia `ARCHITECTURE.md` e este handoff.  
2. Confirme com o usuário: site abre? env ok? último deploy qual commit?  
3. Não reabra cPanel como plano A.  
4. Não delete tokens do banco “por segurança” — só deixe de **expor** na API pública.  
5. Atualize a data e a §2 deste arquivo quando o estado de produção mudar de forma material.

---

**Fim do handoff 2026-07-11.**
