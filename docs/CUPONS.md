# Cupons promocionais

## Admin

**Admin → Cupons** (`/admin/cupons`)

Tipos de desconto:

- **PERCENT** — % sobre o subtotal (ou só nos primeiros N ingressos)
- **FIXED_ORDER** — valor fixo em R$ no pedido
- **FIXED_PER_TICKET** — R$ por ingresso

Regras:

- Escopo: todos os eventos ou um evento
- Mín. de ingressos / máx. com desconto / valor mínimo
- Uso: ilimitado, único, ou até N
- Limite por e-mail (validado no **pagamento**)
- Validade (de/até)

## Produção (MySQL)

Se a tabela não existir após o deploy:

```bash
# no MySQL do EasyPanel, ou:
mysql ... < scripts/sql-promo-codes.sql
```

Ou no container:

```bash
npx prisma db push --schema=./prisma/schema.prisma
```

## Cliente

No seletor de ingressos do evento: campo **Cupom (opcional)**.

## Fluxo técnico

1. `POST /api/orders/create` — valida, reserva uso (`reservedUses++`), grava `Order.discountCents` + `PromoRedemption` (`reserved`)
2. `POST /api/orders/pay` — checa `maxUsesPerEmail`
3. Pagamento confirmado (`finalizePaidOrder`) — redemption `applied`, `redeemedUses++`
4. Cleanup pending / cancel / estorno — libera reserva

## Legado

Chaves `Setting` `promo_code` / `promo_percent` / `promo_active` são migradas automaticamente para um `PromoCode` na primeira listagem no admin (se o código ainda não existir).
