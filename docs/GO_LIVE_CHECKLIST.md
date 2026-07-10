# Go-Live Checklist — portal.lordenelson.com.br

Marque na ordem. **Deploy oficial:** EasyPanel no VPS `151.243.33.241`.  
Handoff: [`HANDOFF_COMPLETO.md`](./HANDOFF_COMPLETO.md).

## A. Código e repo

- [x] Projeto em `C:\Users\aerciompr\projects\lordenelson-ingressos`
- [x] Repo GitHub `aerciompr/portal-lorde-ingresso` (público, `main`)
- [x] `Dockerfile` Node 22 + `nixpacks.toml` + `engines.node`
- [x] Documentação de continuidade (`docs/HANDOFF_COMPLETO.md`, `ARCHITECTURE.md`)
- [ ] `npm run prod:check` local ou CI antes de releases grandes

## B. DNS e host

- [x] Subdomínio `portal.lordenelson.com.br`
- [x] A → `151.243.33.241` (confirmado em resolvers públicos Google/CF)
- [ ] DNS local de todos os operadores sem cache do IP antigo cPanel (`177.136.254.36`) — `ipconfig /flushdns` se necessário
- [x] HTTPS no EasyPanel (Next responde no VPS com Host do domínio)
- [x] Builder EasyPanel = **Dockerfile** (não Nixpacks Node 18)

## C. Banco

- [x] MySQL serviço EasyPanel
- [x] `prisma/schema.prisma` com `provider = "mysql"`
- [x] `npx prisma db push` no container → *database in sync*
- [ ] Backup automático do MySQL ligado no EasyPanel/VPS
- [ ] Eventos reais criados no admin (seed opcional — **apaga** dados)

## D. Env no EasyPanel

- [ ] `NEXT_PUBLIC_APP_URL=https://portal.lordenelson.com.br`
- [x] `DATABASE_URL` (host = nome do serviço MySQL; push já usou com sucesso)
- [ ] `TICKET_SECRET` (único, não rotacionar sem planejar)
- [ ] `ADMIN_EMAIL` + `ADMIN_PASSWORD` forte
- [ ] `CRON_SECRET`
- [ ] `RESEND_API_KEY` + `FROM_EMAIL`
- [ ] Stripe live + `STRIPE_WEBHOOK_SECRET` (se cartão)
- [ ] Mercado Pago live Access Token (se PIX)

Sem aspas nos valores. `@` na senha MySQL → `%40`.

## E. Integrações

- [ ] Webhook MP → `https://portal.lordenelson.com.br/api/webhook/mercadopago`
- [ ] Webhook Stripe → `https://portal.lordenelson.com.br/api/webhook/stripe`
- [ ] Admin → Gateways → URL Pública = `https://portal.lordenelson.com.br`
- [ ] Crons EasyPanel/externos:
  - `*/5 * * * *` sync-payments + `Authorization: Bearer $CRON_SECRET`
  - `*/15 * * * *` cleanup-pending + mesmo secret

## F. Smoke tests

- [ ] Home e programação em https://portal.lordenelson.com.br
- [ ] Login admin
- [ ] Criar evento + lote
- [ ] Compra PIX (confirma via webhook ou poll no checkout)
- [ ] E-mail / Meus Ingressos / PDF
- [ ] Check-in QR
- [ ] Estorno (se aplicável)
- [ ] Virada de lote (esgotar lote de teste)

## G. Operação

- [ ] Senha admin forte e guardada com segurança
- [ ] Monitorar logs EasyPanel (app + webhook) nas primeiras 24h
- [ ] Imagens de evento em URL estável (evitar só disco local se escalar réplicas)
- [ ] Plano de desligar/redirect venda de ingressos no WordPress antigo

## H. Problemas já conhecidos (não reabrir como bug novo)

| Sintoma | Ação |
|---------|------|
| Build Node 18 | Dockerfile / nodejs_22 |
| `EACCES` no `.prisma` após db push | Schema já sync; ignorar |
| `tsx not found` seed | Admin ou `npx --yes tsx` |
| Site no IP antigo | Flush DNS local |
| `pool timeout` no **build** Docker | Normal (DB fake no build) |
