# Stripe por chaves (sem Connect)

Modo recomendado para o portal Lorde Nelson.

## O que precisa

| Item | Onde |
|------|------|
| `pk_live_…` ou `pk_test_…` | Admin → Gateways **e/ou** EasyPanel `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| `sk_live_…` ou `sk_test_…` | Admin → Gateways **e/ou** EasyPanel `STRIPE_SECRET_KEY` |
| Mesmo modo | test com test, live com live |
| Cartão ativo | Admin → Meios de pagamento → Cartão = Stripe |
| Webhook (produção) | Stripe Dashboard → `https://portal.lordenelson.com.br/api/webhook/stripe` |
| `STRIPE_WEBHOOK_SECRET` | EasyPanel env `whsec_…` |

**Não precisa** de Client ID `ca_…` nem OAuth.

## Checklist se “não chega no Stripe”

1. **Admin → Gateways**  
   - Publishable e Secret preenchidos e **Salvar**  
   - Se aparecer conta Connect antiga → **Limpar Connect**  
2. **Meios de pagamento**  
   - Cartão ativo, provedor Stripe  
3. **Valor**  
   - Mínimo Stripe BRL: **R$ 0,50** (50 centavos)  
4. **EasyPanel**  
   - Env com as mesmas chaves (se o admin estiver vazio, usa env)  
   - Redeploy após mudar env  
5. **Dashboard Stripe**  
   - Modo **Live** se usou `pk_live` / `sk_live`  
   - Payments / PaymentIntents  
6. **Logs do app**  
   - Deve aparecer: `[STRIPE] PaymentIntent criado { id: pi_… }`  
   - Se aparecer pagamento **simulado**, as chaves **não** estão sendo lidas  

## Fluxo no código

1. Checkout `method: card` → `POST /api/orders/pay`  
2. Cria **Customer** (e-mail/nome) + `PaymentIntent`  
3. Front monta Stripe Elements com `clientSecret`  
4. `confirmPayment` (redirect para Meus Ingressos)  
5. **Webhook** `payment_intent.succeeded` → `finalizePaidOrder` (paid + QR + e-mail)  
6. **Backup:** `GET /api/orders/[id]/payment-status` e cron `sync-payments` consultam o PI no Stripe  

## Webhook é obrigatório em produção?

**Sim, fortemente recomendado** — é o caminho oficial e confiável.

| Sem webhook | Com webhook |
|-------------|-------------|
| Stripe pode estar OK e pedido ficar `pending` | Pedido vira `paid` em segundos |
| E-mail/PDF só se sync/cron rodar | E-mail e QR no finalize |
| Estorno no Dashboard não marca portal | `charge.refunded` atualiza status |

### Configurar webhook (produção)

1. [Dashboard Stripe](https://dashboard.stripe.com) → **Developers** → **Webhooks** → **Add endpoint**  
2. URL:
   ```text
   https://portal.lordenelson.com.br/api/webhook/stripe
   ```
3. Eventos:
   - `payment_intent.succeeded` (**obrigatório**)
   - `payment_intent.payment_failed` (opcional)
   - `charge.refunded` (estornos)
4. Copiar **Signing secret** `whsec_…`  
5. EasyPanel Environment:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
6. **Implantar** de novo (env só entra no container novo)  
7. No endpoint → **Send test webhook** → deve retornar 200  

### Testar local

```bash
stripe listen --forward-to localhost:3000/api/webhook/stripe
# use o whsec_ que o CLI mostrar no .env local
```

## Checklist de validação completa

1. [ ] Admin Gateways: `pk_` + `sk_` salvos (mesmo modo test/live)  
2. [ ] Connect limpo se não usar OAuth  
3. [ ] Meios: Cartão ativo → Stripe  
4. [ ] Webhook URL + `STRIPE_WEBHOOK_SECRET` + redeploy  
5. [ ] Compra cartão ≥ R$ 0,50  
6. [ ] Dashboard Stripe: PaymentIntent **Succeeded** + **Cliente** com e-mail  
7. [ ] Logs app: `[STRIPE] PaymentIntent criado` e `[STRIPE] paid <orderId>`  
8. [ ] Admin pedidos: status **Pago**  
9. [ ] Meus Ingressos: ingressos + PDF  
10. [ ] E-mail Resend (se configurado)  
11. [ ] Cron `sync-payments` agendado (rede de segurança)  

## Teste

- **Test:** `sk_test` + cartão `4242 4242 4242 4242`  
- **Live:** valor ≥ R$ 0,50, cartão real  

## Limpar Connect residual (SQL / admin)

No admin: botão **Limpar Connect**.  
Ou apagar settings: `stripe_account_id`, `stripe_access_token`, `stripe_refresh_token`.
