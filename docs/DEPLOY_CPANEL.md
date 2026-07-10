# Deploy no cPanel — `portal.lordenelson.com.br`

Guia passo a passo para hospedagem compartilhada/VPS **com cPanel + Node.js**.

> **Requisito:** o plano precisa ter **Setup Node.js App** (Node.js Selector / Application Manager).  
> Se o cPanel for **só PHP**, não roda Next.js nativamente — use Vercel, VPS com Node, ou peça Node ao suporte.

---

## Visão geral

| Item | Valor |
|------|--------|
| Subdomínio | `portal.lordenelson.com.br` |
| Repo | https://github.com/aerciompr/portal-lorde-ingresso |
| App Node | pasta do projeto (ex. `portal` ou `portal.lordenelson.com.br`) |
| Startup file | `server.js` |
| URL pública | `https://portal.lordenelson.com.br` |

---

## 1. Criar o subdomínio no cPanel

1. **Domínios** → **Subdomínios** (ou **Domains**)
2. Subdomínio: `portal`
3. Domínio: `lordenelson.com.br`
4. Document root sugerido:  
   `public_html/portal`  
   **ou** pasta isolada: `portal.lordenelson.com.br`  
   (anote o caminho absoluto, ex. `/home/USUARIO/portal.lordenelson.com.br`)

5. **SSL/TLS** → **Let’s Encrypt** → emitir certificado para `portal.lordenelson.com.br`  
   (force HTTPS se houver a opção)

---

## 2. Banco MySQL no cPanel

1. **MySQL® Databases**
2. Crie banco: `usuario_lordenelson` (prefixo do host costuma ser automático)
3. Crie usuário MySQL com senha forte
4. Adicione o usuário ao banco com **ALL PRIVILEGES**
5. Anote a string:

```text
mysql://USUARIO_MYSQL:SENHA@localhost:3306/NOME_DO_BANCO
```

Em alguns hosts o host não é `localhost` — use o valor indicado no cPanel (às vezes `127.0.0.1`).

---

## 3. Enviar o código

### Opção A — Git no cPanel (recomendado)

1. **Git Version Control** → Create
2. Clone URL:  
   `https://github.com/aerciompr/portal-lorde-ingresso.git`
3. Repository Path: a pasta do subdomínio (ex. `/home/USUARIO/portal.lordenelson.com.br`)
4. Clone.

Se o repo for **privado**, use:
- Deploy key no GitHub, ou  
- clone via SSH, ou  
- Personal Access Token na URL (cuidado para não expor)

### Opção B — Upload ZIP

1. No PC: baixe ZIP da `main` no GitHub  
2. File Manager → pasta do subdomínio → Upload → Extract  
3. Não envie `node_modules` nem `.env` com segredos em repositório público

### Opção C — Terminal SSH

```bash
cd ~
git clone https://github.com/aerciompr/portal-lorde-ingresso.git portal.lordenelson.com.br
cd portal.lordenelson.com.br
```

---

## 4. Application Node.js no cPanel

1. **Setup Node.js App** (ou **Application Manager**)
2. **Create Application**
3. Preencha:

| Campo | Valor |
|-------|--------|
| Node.js version | **20.x** (ou 18.x LTS mínimo) |
| Application mode | **Production** |
| Application root | pasta do projeto (ex. `portal.lordenelson.com.br`) |
| Application URL | `portal.lordenelson.com.br` |
| Application startup file | **`server.js`** |

4. **Create**

### Variáveis de ambiente (Environment variables)

No painel da app Node, adicione:

```text
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://portal.lordenelson.com.br
DATABASE_URL=mysql://USUARIO:SENHA@localhost:3306/BANCO
TICKET_SECRET=gere_64_hex
ADMIN_EMAIL=admin@lordenelson.com.br
ADMIN_PASSWORD=senha_forte
CRON_SECRET=gere_outro_hex
RESEND_API_KEY=re_...
FROM_EMAIL=ingressos@lordenelson.com.br
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_PUBLIC_KEY=APP_USR-...
```

Gere segredos no PC:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Clique **Save** nas variáveis.

---

## 5. Prisma em produção (MySQL)

No servidor (SSH **ou** terminal do Node.js app “Run NPM Install” + SSH):

1. Edite `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

2. Na pasta do app:

```bash
# Entre no virtualenv Node do cPanel se o painel mostrar o comando "Enter to virtual environment"
# exemplo:
source /home/USUARIO/nodevenv/portal.lordenelson.com.br/20/bin/activate
cd /home/USUARIO/portal.lordenelson.com.br

npm install
npx prisma generate
npx prisma db push
npm run build
```

3. No painel Node.js → **Restart** da aplicação.

> Se `npm run build` estourar memória, peça ao host mais RAM ou rode o build na máquina local e envie a pasta `.next` (menos ideal). Alternativa: `NODE_OPTIONS=--max-old-space-size=2048 npm run build`

---

## 6. Startup e package.json

O projeto já inclui `server.js` para o cPanel.

No painel, **Application startup file** = `server.js`.

Scripts úteis:

```bash
npm run build   # gera .next + prisma generate
# start via cPanel = node server.js (automático)
```

---

## 7. Crons no cPanel (automação)

**Cron Jobs** → adicione (ajuste usuário e path):

```cron
# A cada 5 min — sync PIX + virada de lote
*/5 * * * * curl -s -H "Authorization: Bearer SEU_CRON_SECRET" "https://portal.lordenelson.com.br/api/cron/sync-payments" >/dev/null 2>&1

# A cada 15 min — limpa pending e devolve estoque
*/15 * * * * curl -s -H "Authorization: Bearer SEU_CRON_SECRET" "https://portal.lordenelson.com.br/api/cron/cleanup-pending" >/dev/null 2>&1
```

Use o **mesmo** `CRON_SECRET` das variáveis de ambiente.

---

## 8. Webhooks (obrigatório)

### Mercado Pago
```
https://portal.lordenelson.com.br/api/webhook/mercadopago
```

### Stripe
```
https://portal.lordenelson.com.br/api/webhook/stripe
```

No **Admin do portal** → Configurações → Gateways → **URL Pública**:

```
https://portal.lordenelson.com.br
```

---

## 9. Uploads de imagem

Em hospedagem Node, `public/uploads` **pode funcionar** se a pasta for gravável:

```bash
mkdir -p public/uploads
chmod 755 public/uploads
```

Ainda assim, backup e permissões importam. URLs externas (CDN) continuam sendo a opção mais estável.

---

## 10. Checklist rápido

- [ ] `https://portal.lordenelson.com.br` abre o site
- [ ] SSL ok (cadeado)
- [ ] Login admin
- [ ] Criar evento / lote
- [ ] PIX teste → status muda sozinho
- [ ] E-mail Resend (domínio verificado)
- [ ] PDF ingresso
- [ ] Crons rodando (log no cPanel)
- [ ] Webhooks 200 no painel MP/Stripe

---

## 11. Problemas comuns

| Problema | Solução |
|----------|---------|
| **Application error / 503** | Restart app; ver logs do Node.js no cPanel |
| **Cannot find module** | `npm install` dentro do virtualenv da app |
| **Prisma / SQLite em prod** | Trocar provider para `mysql` e `db push` |
| **Build OOM** | NODE_OPTIONS max-old-space; ou build local |
| **Webhook não chega** | URL HTTPS + token live + URL Pública no admin |
| **Subdomínio abre pasta vazia** | Application URL do Node = portal.lordenelson.com.br |
| **Repo privado clone falha** | Deploy key ou token no Git |

Logs: **Setup Node.js App** → sua app → **Show logs** / stderr.

---

## 12. Atualizar o site depois

```bash
cd /home/USUARIO/portal.lordenelson.com.br
# virtualenv se necessário
git pull origin main
npm install
npx prisma generate
npx prisma db push
npm run build
# Restart no painel Node.js
```

---

## Documentos relacionados

- `docs/DEPLOY_SUBDOMAIN.md` — visão geral subdomínio  
- `docs/GO_LIVE_CHECKLIST.md` — checklist  
- `.env.example` — lista de variáveis  
