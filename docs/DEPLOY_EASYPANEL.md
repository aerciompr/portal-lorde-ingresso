# Deploy no EasyPanel — `portal.lordenelson.com.br`

VPS: `151.243.33.241`  
Repo: https://github.com/aerciompr/portal-lorde-ingresso  
Painel: EasyPanel (Docker)

**Continuidade / handoff:** [`HANDOFF_COMPLETO.md`](./HANDOFF_COMPLETO.md) · índice [`README.md`](./README.md)

---

## Visão geral

```text
DNS: portal.lordenelson.com.br  →  A  →  151.243.33.241
EasyPanel:
  ├── MySQL (serviço de banco)
  └── App (GitHub + Dockerfile) → porta 3000 → domínio + HTTPS
```

---

## 0. DNS (faça primeiro)

No provedor DNS do domínio:

| Tipo | Nome | Valor |
|------|------|--------|
| **A** | `portal` | `151.243.33.241` |

Teste:

```bash
nslookup portal.lordenelson.com.br
# deve retornar 151.243.33.241
```

Portas no VPS (firewall): **80**, **443**, **22** (e a porta do EasyPanel se usar).

---

## 1. Projeto no EasyPanel

1. Abra o EasyPanel no VPS  
2. **Create Project** (ex.: `lordenelson`)  
3. Dentro do projeto, crie **2 serviços**:

---

## 2. Serviço MySQL

1. **+ Service** → **MySQL** (ou MariaDB)  
2. Nome: `mysql` (ou `db`)  
3. Defina:
   - Database name: `portal` (ou `lordenelson`)  
   - User: `portal`  
   - Password: **senha forte** (anote)  
4. Deploy / Start  
5. Anote a connection interna do EasyPanel. Em geral:

```text
mysql://portal:SENHA@mysql:3306/portal
```

> No EasyPanel, o host do banco entre containers costuma ser o **nome do serviço** (`mysql`), **não** `localhost`.

---

## 3. Serviço App (Next.js)

1. **+ Service** → **App**  
2. **Source:** GitHub  
   - Repo: `aerciompr/portal-lorde-ingresso`  
   - Branch: `main`  
3. **Build (importante):**  
   - Preferência: **Builder = Dockerfile** (arquivo na raiz do repo)  
   - **Não** deixe só Nixpacks com Node 18 — o Next.js 16 exige **Node ≥ 20.9**  
   - Se usar Nixpacks: o repo tem `nixpacks.toml` forçando **Node 22**  
   - Build path: `/` (raiz)  
4. **Port:** `3000`  
5. **Domains:**  
   - Add domain: `portal.lordenelson.com.br`  
   - Porta do serviço: `3000`  
   - HTTPS / Let's Encrypt: **ligado**  
   - Marque como domínio principal (estrela), se houver  

### Erro: `Node.js 18 ... Next.js requires >=20.9.0`

O EasyPanel usou **Nixpacks com Node 18**. Corrija:

1. No serviço App → **Build / Settings**  
2. Selecione **Dockerfile** (não Nixpacks), **ou**  
3. Redeploy após o `git pull` (com `nixpacks.toml` + `engines.node` no package.json)  
4. Force redeploy / rebuild sem cache se a opção existir  


### Environment (aba Environment)

Cole **sem aspas** nos valores:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
NEXT_PUBLIC_APP_URL=https://portal.lordenelson.com.br

# Host = nome do serviço MySQL no EasyPanel (ex: mysql)
DATABASE_URL=mysql://portal:SENHA_FORTE@mysql:3306/portal

TICKET_SECRET=cole_hex_64_chars
ADMIN_EMAIL=admin@lordenelson.com.br
ADMIN_PASSWORD=senha_admin_forte
CRON_SECRET=outro_hex_forte

RESEND_API_KEY=re_...
FROM_EMAIL=ingressos@lordenelson.com.br

STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_PUBLIC_KEY=APP_USR-...

# Força adapter JS (recomendado)
PRISMA_USE_ADAPTER=1
```

Gere secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Senha MySQL com `@`:** use `%40` na URL (ex.: `Portal@123` → `Portal%40123`).

Ative **Create .env file** se o EasyPanel tiver a opção.

6. **Deploy**

---

## 4. Criar tabelas no banco (uma vez)

Depois do primeiro deploy (ou pelo terminal do container da app):

No EasyPanel → App → **Terminal** / **Console**:

```bash
npx prisma db push --schema=./prisma/schema.prisma
```

No VPS o engine do Prisma **funciona** (diferente do cPanel).  
Se falhar, use:

```bash
node scripts/db-push-cpanel.js
```

(com `DATABASE_URL` já no ambiente do container)

Aviso `EACCES unlink .../.prisma/client` pode aparecer (user `nextjs` sem write nos files gerados no build). Se a mensagem foi **database is now in sync**, o schema está OK.

**Seed (opcional):** a imagem não inclui `tsx`. Preferir criar eventos no **Admin**. Se precisar:

```bash
npx --yes tsx prisma/seed.ts
```

⚠️ O seed **apaga** tickets, orders e events.

---

## 5. Crons no EasyPanel

Se o EasyPanel tiver **Cron Jobs** / scheduled tasks:

| Schedule | URL / comando |
|----------|----------------|
| `*/5 * * * *` | `curl -s -H "Authorization: Bearer $CRON_SECRET" https://portal.lordenelson.com.br/api/cron/sync-payments` |
| `*/15 * * * *` | `curl -s -H "Authorization: Bearer $CRON_SECRET" https://portal.lordenelson.com.br/api/cron/cleanup-pending` |

Ou um serviço **Cron** no mesmo projeto apontando para essas URLs.

---

## 6. Webhooks

| Gateway | URL |
|---------|-----|
| Mercado Pago | `https://portal.lordenelson.com.br/api/webhook/mercadopago` |
| Stripe | `https://portal.lordenelson.com.br/api/webhook/stripe` |

No admin do portal → Configurações → Gateways → **URL Pública**:

```text
https://portal.lordenelson.com.br
```

---

## 7. Checklist EasyPanel

- [ ] DNS `portal` → `151.243.33.241`
- [ ] MySQL service rodando
- [ ] App service build OK (logs verdes)
- [ ] Domínio + HTTPS no EasyPanel
- [ ] Env sem aspas; `DATABASE_URL` com host do serviço MySQL
- [ ] `prisma db push` ok
- [ ] Site abre: https://portal.lordenelson.com.br
- [ ] Login admin
- [ ] Webhooks + crons

---

## 8. Atualizar depois de um `git push`

No EasyPanel → App → **Deploy** (rebuild a partir do `main`).

Se mudou o schema Prisma:

```bash
# terminal do container
npx prisma db push --schema=./prisma/schema.prisma
```

---

## 9. Problemas comuns

| Problema | Solução |
|----------|---------|
| Build falha | Ver logs do build no EasyPanel; confira Dockerfile |
| Site 502 | App não subiu — logs do container; porta 3000 |
| DB connection refused | Host da URL = nome do serviço MySQL (`mysql`), não `localhost` |
| SSL não emite | DNS ainda não aponta para o VPS; espere propagar |
| Incomplete response | Container crash — ver logs; env `DATABASE_URL` / `TICKET_SECRET` |

---

## 10. Diferença cPanel × EasyPanel

| | cPanel | EasyPanel |
|--|--------|-----------|
| Build | EAGAIN / limite | Docker no VPS (ok) |
| MySQL | socket `/tmp/mysql.sock` | host do serviço `mysql:3306` |
| Deploy | manual | GitHub + Deploy |
| SSL | cPanel | EasyPanel / Traefik |

---

Repo com `Dockerfile` na raiz — o EasyPanel detecta e builda sozinho.
