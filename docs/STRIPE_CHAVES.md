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
2. `stripe.paymentIntents.create({ amount: totalCents, currency: 'brl' })`  
3. Front monta Stripe Elements com `clientSecret`  
4. `confirmPayment`  
5. Webhook `payment_intent.succeeded` → pedido `paid`  

## Teste

- **Test:** `sk_test` + cartão `4242 4242 4242 4242`  
- **Live:** valor ≥ R$ 0,50, cartão real  

## Limpar Connect residual (SQL / admin)

No admin: botão **Limpar Connect**.  
Ou apagar settings: `stripe_account_id`, `stripe_access_token`, `stripe_refresh_token`.
