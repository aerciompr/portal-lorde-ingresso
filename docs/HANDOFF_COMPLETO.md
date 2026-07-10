# Handoff completo — continuar o projeto (IA / DEV)

**Atualizado:** 2026-07-10  
**Objetivo deste arquivo:** permitir que **outra pessoa ou outra IA** retome o trabalho sem perder contexto das sessões de desenvolvimento e deploy.

Leia também: [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`DEPLOY_EASYPANEL.md`](./DEPLOY_EASYPANEL.md), [`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md).

---

## 1. Identidade do projeto

| Campo | Valor |
|-------|--------|
| Nome | Lorde Nelson Ingressos (portal de tickets) |
| Path local (Windows) | `C:\Users\aerciompr\projects\lordenelson-ingressos` |
| GitHub | https://github.com/aerciompr/portal-lorde-ingresso (público) |
| Branch | `main` |
| Domínio prod | `https://portal.lordenelson.com.br` |
| VPS / EasyPanel | IP `151.243.33.241` |
| Substituí | WordPress + WooCommerce em www.lordenelson.com.br (site antigo do pub) |

---

## 2. Estado em 2026-07-10 (o que já está feito)

### Produto / código (implementado)

- Portal público: home, eventos, detalhe com seletor de **lotes**, checkout, meus ingressos, PDF/QR  
- Admin: eventos, lotes (virar/update/delete), pedidos, estorno, ferramentas (manual/cortesia/cleanup), layout ingresso, reports, settings  
- Check-in com câmera + validação  
- Pagamentos reais: **Mercado Pago PIX** + **Stripe cartão**  
- `finalizePaidOrder` → paid + QR + e-mail + virada de lote  
- Webhooks MP/Stripe + polling no checkout  
- Crons: sync payments + cleanup pending  
- Formatação BRL, rich text Tiptap, footer legal nos eventos  
- Prisma schema **MySQL only** (sem SQLite em schema atual)

### Infra / deploy

| Etapa | Status |
|-------|--------|
| Repo público no GitHub | Feito |
| Dockerfile Node 22 multi-stage | Feito |
| `nixpacks.toml` Node 22 + `engines` | Feito |
| EasyPanel build **Success** (Dockerfile) | Feito |
| MySQL no EasyPanel + `prisma db push` **sync OK** | Feito |
| DNS público `portal` → `151.243.33.241` | Feito (Google/CF) |
| HTTPS Next.js respondendo no VPS com Host do domínio | Confirmado por probe externo |
| DNS cache em alguns PCs ainda no IP cPanel `177.136.254.36` | Pode ocorrer — flush DNS |
| Crons HTTP em produção | **Pendente de configurar** no EasyPanel/host |
| Webhooks live apontando para portal. | **Validar / configurar** |
| Seed de eventos em prod | Opcional; `tsx` ausente na imagem — preferir criar no admin |
| Smoke test compra real end-to-end em prod | **Pendente** |

### Caminhos abandonados (não reabrir sem motivo)

1. **cPanel Node** (`177.136.*`): EAGAIN no `next build`, CageFS/Prisma binary, symlink, resource limits.  
2. **Nixpacks Node 18** no EasyPanel: Next 16 exige ≥20.9 — use **Dockerfile**.  
3. Deploy de artefato `next-build.tgz` no cPanel (GitHub Actions) — só histórico em `BUILD_CPANEL_EAGAIN.md`.

---

## 3. O que a sessão de deploy resolveu (erros reais)

| Erro | Causa | Solução |
|------|--------|---------|
| `Node.js 18.20.5` / Next exige ≥20.9 | EasyPanel Nixpacks default Node 18 | Builder **Dockerfile** ou `nixpacks.toml` nodejs_22 + commit com engines |
| `Cannot find module postinstall-prisma.js` no `npm ci` Docker | Stage deps só copia package.json | `postinstall ... \|\| true`; generate no builder |
| `pool timeout` Prisma no `next build` | `DATABASE_URL` fake 127.0.0.1 no build | Esperado; runtime usa MySQL real |
| `EACCES unlink .prisma/client` após db push | User `nextjs` read-only em node_modules | Schema já sync; ignorar ou regenerar como root |
| `tsx: not found` no seed | tsx não está nas deps da imagem prod | `npx --yes tsx ...` ou admin UI; seed apaga dados |
| Site “não abre” no PC do dev | DNS local cache IP cPanel antigo | `ipconfig /flushdns`; DNS 8.8.8.8; HTTPS no IP novo OK |
| Upload de imagem falha no admin | User `nextjs` sem write em `public/uploads` (EACCES) | Dockerfile com `chown` em `/app/public/uploads`; volume opcional |
| `Incomplete response` cPanel | `HOSTNAME` do OS no bind | `server.js` usa `HOST=0.0.0.0` |
| Password MySQL com `@` na URL | Parsing URL | Encode `%40` |
| DATABASE_URL com aspas do cPanel | Painel grava quotes | `cleanEnvUrl` em `lib/prisma.ts` |

---

## 4. Como o ambiente de produção está montado

```text
DNS A: portal.lordenelson.com.br → 151.243.33.241

EasyPanel project (ex.: chatwoot / lordenelson):
  ├── MySQL service
  │     host interno: nome do serviço (ex. chatwoot_portal_lorde ou mysql)
  │     database: portal_lorde (exemplo visto no shell)
  └── App service (portal_lorde_next)
        source: GitHub aerciompr/portal-lorde-ingresso @ main
        builder: Dockerfile
        port: 3000
        domain: portal.lordenelson.com.br + TLS
```

**DATABASE_URL em runtime (padrão EasyPanel):**

```text
mysql://USER:PASS@NOME_DO_SERVICO_MYSQL:3306/NOME_DB
```

Host **nunca** é `localhost` entre containers.

Shell do container (já usado com sucesso):

```bash
npx prisma db push --schema=./prisma/schema.prisma
# → "Your database is now in sync with your Prisma schema"
```

---

## 5. Variáveis de ambiente (produção)

Template: [`.env.example`](../.env.example). Guia: [`DEPLOY_EASYPANEL.md`](./DEPLOY_EASYPANEL.md).

### Obrigatórias para o app subir e vender

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
NEXT_PUBLIC_APP_URL=https://portal.lordenelson.com.br
DATABASE_URL=mysql://...@servico:3306/db
TICKET_SECRET=<hex 64 chars, estável>
ADMIN_EMAIL=...
ADMIN_PASSWORD=<forte>
CRON_SECRET=<forte>
```

### Pagamentos / e-mail

```env
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_PUBLIC_KEY=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
FROM_EMAIL=ingressos@lordenelson.com.br
PRISMA_USE_ADAPTER=1
```

Settings também podem ir pelo **Admin → Configurações** (tabela `Setting`), com fallback de env.

**Webhooks:**

- `https://portal.lordenelson.com.br/api/webhook/mercadopago`
- `https://portal.lordenelson.com.br/api/webhook/stripe`

---

## 6. Comandos do dia a dia

### Local

```bash
cd C:\Users\aerciompr\projects\lordenelson-ingressos
cp .env.example .env   # preencher
npm install
npx prisma generate --schema=./prisma/schema.prisma
npx prisma db push --schema=./prisma/schema.prisma
npm run dev
```

Admin local: `/admin/login` com `ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env`.

### Deploy

```bash
git add -A && git commit -m "..." && git push origin main
# EasyPanel → App → Deploy (rebuild)
# Se schema mudou, no console do container:
npx prisma db push --schema=./prisma/schema.prisma
```

### Seed (CUIDADO)

```bash
# Apaga tickets, orders, ticketTypes, events e recria demos
npx --yes tsx prisma/seed.ts
```

Preferível em prod: criar eventos no admin.

---

## 7. Arquivos que você NÃO deve “otimizar” sem entender

| Arquivo | Por quê |
|---------|---------|
| `lib/finalize-paid-order.ts` | Coração do paid; webhooks + poll + crons |
| `lib/lote-virada.ts` | Estoque e preço de lote |
| `lib/prisma.ts` | Adapter MariaDB + clean URL |
| `lib/settings.ts` | Dual source env/DB |
| `server.js` | Bind host/port produção |
| `Dockerfile` | Node 22 + multi-stage EasyPanel |
| `prisma/schema.prisma` | MySQL; mudanças exigem db push em prod |

---

## 8. Próximos passos recomendados (ordem)

1. **Garantir DNS** em todos os resolvers (flush cache) — HTTPS deve servir Next.js.  
2. Confirmar **env completa** no EasyPanel (gateways, Resend, secrets).  
3. Configurar **crons** (sync 5 min, cleanup 15 min) com `CRON_SECRET`.  
4. Registrar **webhooks** MP + Stripe na URL do portal.  
5. Admin → URL pública = `https://portal.lordenelson.com.br`.  
6. Criar **evento real** + lotes no admin.  
7. Smoke: PIX teste/live mínimo → paid → e-mail → PDF → check-in.  
8. (Opcional) Melhorias: storage S3 para uploads, OAuth MP multi-conta, testes automatizados, seed JS sem tsx.  
9. Quando estável: desligar/redirect do fluxo de ingressos no WordPress antigo.

---

## 9. Mapa mental “onde mexer”

| Quero… | Onde |
|--------|------|
| Mudar layout do PDF | `lib/generate-ticket.ts`, admin ingresso-preview |
| Mudar regra de lote | `lib/lote-virada.ts`, admin lotes API |
| Novo campo no evento | `schema.prisma` + admin events + UI evento |
| Fix pagamento PIX | `app/api/orders/pay`, webhook mercadopago, finalize |
| Fix deploy EasyPanel | `Dockerfile`, `DEPLOY_EASYPANEL.md`, env do painel |
| Auth admin | `lib/auth.ts`, `app/api/admin/login` |
| Textos BRL / masks | `lib/utils.ts`, `lib/masks.ts` |

---

## 10. Comunicação e regras para agentes (IA)

1. Responder em **português (pt-BR)** ao usuário deste projeto.  
2. Não commitar segredos.  
3. Preferir **Dockerfile** no EasyPanel.  
4. Após schema change, lembrar **db push no container**.  
5. Não reintroduzir SQLite no schema de produção sem decisão explícita.  
6. Commits: mensagens claras em pt ou conventional commits.  
7. Workspace às vezes abre em `C:\Windows\System32` — **código real** está em `C:\Users\aerciompr\projects\lordenelson-ingressos`.  
8. Skills em `.grok/skills/` (nextjs-fullstack, security-audit, etc.) quando aplicável.

Ver também [`../AGENTS.md`](../AGENTS.md).

---

## 11. Histórico resumido da jornada

1. Features de produção: pagamentos, lotes, admin tools, PDF, crons.  
2. Tentativa cPanel subdomain → limites de shared host.  
3. Repo privado → público para deploy.  
4. Migração VPS `151.243.33.241` + EasyPanel.  
5. Fix Node 22 + Dockerfile.  
6. Build success + MySQL schema sync.  
7. DNS público no VPS; HTTPS Next confirmado.  
8. Documentação de continuidade (este pacote).

---

## 12. Contatos / credenciais

- Credenciais **não** ficam no git.  
- Admin, MySQL e chaves: EasyPanel Environment + password manager do dono do projeto.  
- GitHub: conta `aerciompr`.

---

**Se você é uma IA lendo isto agora:**  
1) Leia `ARCHITECTURE.md`  
2) Confirme status de prod com o usuário (site abre? env set? crons?)  
3) Execute o passo pendente da seção 8 sem reabrir cPanel  
4) Atualize este handoff se o estado de produção mudar de forma material
