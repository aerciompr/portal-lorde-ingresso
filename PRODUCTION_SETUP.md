# Configuração para Produção - Lorde Nelson Ingressos

**Atenção:** NUNCA commite chaves reais ou senhas. Use variáveis de ambiente no host (EasyPanel / VPS).

| Documento | Uso |
|-----------|-----|
| [`docs/HANDOFF_COMPLETO.md`](./docs/HANDOFF_COMPLETO.md) | **Estado real + continuidade IA/DEV** |
| [`docs/DEPLOY_EASYPANEL.md`](./docs/DEPLOY_EASYPANEL.md) | **Deploy oficial** (VPS EasyPanel) |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Arquitetura e fluxos |
| [`docs/GO_LIVE_CHECKLIST.md`](./docs/GO_LIVE_CHECKLIST.md) | Checklist go-live |
| [`docs/SESSION_HANDOFF.md`](./docs/SESSION_HANDOFF.md) | Handoff de features |
| [`.env.example`](./.env.example) | Template de env |

> **Banco atual:** Prisma `provider = "mysql"`. Em EasyPanel o host de `DATABASE_URL` é o **nome do serviço MySQL**, não `localhost`.  
> Domínio produção: `https://portal.lordenelson.com.br` · IP VPS: `151.243.33.241`.

## 1. Banco de Dados MySQL (já feito localmente)

Seu MySQL local:
- Usuário: root
- Senha: (vazia)
- Porta: 3306 (padrão)
- Database: lordenelson_ingressos

Connection string no `.env`:
```
DATABASE_URL="mysql://root:@localhost:3306/lordenelson_ingressos"
```

### Para Produção (obrigatório)
Não use localhost. Providencie um MySQL hospedado:
- Railway (fácil)
- Aiven
- PlanetScale
- DigitalOcean Managed MySQL
- AWS RDS

Exemplo de string para produção:
```
DATABASE_URL="mysql://usuario:senha@host:3306/lordenelson_ingressos?sslaccept=strict"
```

**Dica Vercel (serverless):** Adicione parâmetros para limitar conexões:
`?connection_limit=5&pool_timeout=10`

Aplique o schema:
```bash
npx prisma generate
npx prisma db push
```

## 2. Chaves de Produção (LIVE)

Substitua no `.env` (ou variáveis Vercel) pelas suas chaves reais fornecidas:

### Stripe
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Mercado Pago
```
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...   # produção
MERCADOPAGO_PUBLIC_KEY=APP_USR-...
MERCADOPAGO_CLIENT_ID=...
MERCADOPAGO_CLIENT_SECRET=...
```

**Importante:** 
- Essas são chaves **LIVE**. Testes vão cobrar dinheiro real.
- No Vercel, configure como Environment Variables (nunca no código).
- Para testes locais com ngrok, use com cuidado.

## 3. Segredos Adicionais (Gere e Substitua)

No `.env`, gere valores fortes:

- **TICKET_SECRET**: Use um string longa aleatória (32+ bytes hex). Exemplo gerado: (substitua por um novo)
  Gere com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

- **ADMIN_PASSWORD**: Senha forte para o painel admin.

- **NEXTAUTH_SECRET**: Longa string aleatória.

Exemplo no .env:
```
TICKET_SECRET=seu-valor-gerado-aqui-64-caracteres
ADMIN_PASSWORD=sua-senha-forte-aqui
NEXTAUTH_SECRET=outra-string-longa-e-aleatoria
```

## 4. URL da Aplicação

```
NEXT_PUBLIC_APP_URL=http://localhost:3000   # para local
# Para prod: https://seudominio.com
```

## 5. Webhooks (Produção Obrigatório)

### Stripe
1. Acesse https://dashboard.stripe.com/webhooks
2. Adicione endpoint: `https://SEU-DOMINIO.com/api/webhook/stripe`
3. Copie o "Signing secret" (whsec_...)
4. Adicione ao Vercel como `STRIPE_WEBHOOK_SECRET=whsec_...`

### Mercado Pago
1. Acesse https://www.mercadopago.com.br/developers/panel/notifications
2. Adicione URL de notificação: `https://SEU-DOMINIO.com/api/webhook/mercadopago`
3. Salve.

**Teste local com ngrok:**
```bash
ngrok http 3000
```
Use a URL https gerada temporariamente nos dashboards.

## 6. Imagens Reais (Banners e Eventos)

- Substitua placeholders no código (se ainda houver) por imagens reais.
- Para eventos: adicione `imageUrl` no banco ou admin.
- Coloque assets em `/public/images/` ou use CDN.
- Recomendado: otimize para web (WebP, tamanhos responsivos).

## 7. Deploy no Vercel

1. Conecte o repositório no Vercel.
2. **NÃO** use o `.env` local. Configure TODAS as variáveis no painel Vercel > Settings > Environment Variables:
   - DATABASE_URL (MySQL remoto)
   - Todas as chaves Stripe / MP (live)
   - TICKET_SECRET, ADMIN_PASSWORD, etc.
   - NEXT_PUBLIC_APP_URL = https://seudominio.com
3. Adicione domínio customizado.
4. Deploy.
5. Rode `npx prisma db push` via Vercel CLI ou console se necessário.

**Comando para preview local de prod:**
```bash
npm run build
npm start
```

## 8. Testes Finais (Obrigatórios antes de ir ao ar)

- Crie evento no admin.
- Compre com PIX e cartão reais (valor mínimo).
- Acesse ingressos pelo código gerado.
- Baixe PDF e valide QR manualmente.
- Teste check-in em `/checkin`.
- Solicite cancelamento e aprove.
- Verifique relatórios em `/admin/reports`.
- Teste emails (Resend).
- Simule falhas (webhook down, pagamento negado).

## 9. Segurança Extra

- Mantenha `TICKET_SECRET` secreto (usado para assinar QR).
- Use HTTPS sempre.
- Monitore webhooks e erros.
- Considere rate limiting no check-in se necessário.
- Remova dados de seed/demo em produção (`prisma/seed.ts` só para dev).

## 10. Variáveis de Ambiente Completas (Resumo)

```
DATABASE_URL=...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_PUBLIC_KEY=APP_USR-...
MERCADOPAGO_CLIENT_ID=...
MERCADOPAGO_CLIENT_SECRET=...
NEXT_PUBLIC_APP_URL=https://...
TICKET_SECRET=change-this-to-a-long-random-hmac-secret
ADMIN_PASSWORD=change-this-strong-password-in-production
RESEND_API_KEY=... (obrigatório para e-mail automático de ingressos)
FROM_EMAIL=ingressos@lordenelson.com.br
CRON_SECRET=long-random-secret-for-cron-cleanup

# Taxas e configs agora são salvas no banco via painel Admin (mais seguro + não perdem)
# pix_fee_percent, card_fee_percent, pix_fee_fixed_cents, etc. + from_email
```

### Automação pós-pagamento e limpeza de estoque

Após o webhook do Stripe (`payment_intent.succeeded`) ou Mercado Pago (status `approved`):
1. Pedido vira `paid`
2. QR Codes dos ingressos são gerados
3. E-mail de confirmação é enviado (precisa de `RESEND_API_KEY`)
4. Virada de lote é tentada se aplicável

Limpeza de pedidos pending abandonados:
- Endpoint: `GET /api/cron/cleanup-pending` (auth: `Authorization: Bearer CRON_SECRET`)
- Vercel Cron: a cada 15 min (`vercel.json`)
- TTL padrão: 30 min (ajustável em Admin → Configurações → Regras)

Sincronização de pagamentos PIX + virada de lote:
- Endpoint: `GET /api/cron/sync-payments` (mesmo `CRON_SECRET`)
- Vercel Cron: a cada 5 min
- Checkout PIX faz polling a cada 3s em `/api/orders/[id]/payment-status`
- Virada automática ao esgotar lote; virada manual esgota o lote anterior


## Dicas Finais

- **Teste local primeiro** com suas chaves e MySQL local.
- Para produção real, migre o banco para host remoto e use as mesmas chaves no Vercel.
- Qualquer dúvida sobre um passo específico, pergunte!
- Após deploy, atualize os webhooks para a URL final do domínio.

Boa sorte com o lançamento! O portal está quase pronto.