# Go-Live Checklist — Subdomínio

Use este checklist na ordem. Marque cada item.

## A. Código e repo

- [ ] Projeto em `C:\Users\aerciompr\projects\lordenelson-ingressos`
- [ ] `docs/SESSION_HANDOFF.md` revisado
- [ ] `.env.example` copiado e preenchido no host (não no git)
- [ ] `npm run prod:check` passa localmente (ou no CI)

## B. DNS e host

- [ ] Subdomínio criado (ex. `ingressos.lordenelson.com.br`)
- [ ] CNAME/A apontando para Vercel ou VPS
- [ ] HTTPS ativo (cadeado no browser)

## C. Banco

- [ ] MySQL/Postgres de produção criado
- [ ] `prisma/schema.prisma` com `provider` correto (`mysql` ou `postgresql`)
- [ ] `npx prisma db push` (ou migrate) no banco remoto
- [ ] Backup automático do provedor ligado

## D. Env no host

- [ ] `NEXT_PUBLIC_APP_URL=https://SEU-SUBDOMINIO`
- [ ] `DATABASE_URL`
- [ ] `TICKET_SECRET` (único, não rotacionar sem planejar)
- [ ] `ADMIN_EMAIL` + `ADMIN_PASSWORD` forte
- [ ] `CRON_SECRET`
- [ ] `RESEND_API_KEY` + `FROM_EMAIL`
- [ ] Stripe live + `STRIPE_WEBHOOK_SECRET`
- [ ] Mercado Pago live (Access Token)

## E. Integrações

- [ ] Webhook MP → `/api/webhook/mercadopago`
- [ ] Webhook Stripe → `/api/webhook/stripe`
- [ ] Admin → Gateways → URL Pública = subdomínio HTTPS
- [ ] Crons Vercel (ou externo) com `CRON_SECRET`

## F. Testes smoke

- [ ] Home e programação carregam
- [ ] Login admin
- [ ] Evento + lote
- [ ] Compra PIX (confirma sozinho no checkout)
- [ ] E-mail / Meus Ingressos / PDF
- [ ] Check-in QR
- [ ] Estorno (se aplicável)

## G. Operação

- [ ] Senha admin trocada e guardada com segurança
- [ ] Monitorar logs de webhook nas primeiras 24h
- [ ] Imagens de evento em URL estável (não só disco local do serverless)
