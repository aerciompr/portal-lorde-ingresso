# Migração WooCommerce → Portal Lorde Nelson

## O que há no dump `lord9962_home.sql` (~131 MB)

| Sistema | Uso |
|---------|-----|
| **WooCommerce** | Pedidos, produtos, clientes |
| **Event Tickets (Tribe)** | Produto = ingresso; meta `_tribe_wooticket_for_event` → evento |
| **The Events Calendar** | `wp_tec_events` + posts `tribe_events` |
| **Stripe + Mercado Pago** | Metas `_stripe_intent_id`, `_Mercado_Pago_Payment_IDs` |

Tabelas mais úteis para import:

- `wp_wc_order_stats` — status, totais, datas  
- `wp_wc_order_product_lookup` — produto × qty × receita  
- `wp_wc_customer_lookup` / `wp_wc_order_addresses` — e-mail/nome  
- `wp_postmeta` — `_billing_*`, pagamento, `_tribe_wooticket_for_event`  
- `wp_posts` — títulos de produto/evento  
- `wp_tec_events` — data/hora do evento  

---

## Estratégia recomendada

```text
1) Importar o SQL num MySQL local separado (wp_legacy) — NÃO no banco do portal
2) Rodar script de migração (dry-run → real) apontando WP_DATABASE_URL
3) Validar no portal local (Meus Ingressos, check-in, admin)
4) Só então rodar no MySQL de produção (backup antes)
```

**Não** misturar o dump WordPress inteiro no banco do portal (são schemas diferentes).

### Mapeamento

| Woo / Tribe | Portal |
|-------------|--------|
| Evento TEC (`wp_tec_events` + post) | `Event` |
| Product ticket (`_tribe_wooticket_for_event`) | `TicketType` do evento |
| Order `wc-completed` / `processing` | `Order` `status=paid` |
| Line item qty | N × `Ticket` |
| Order refunded | `Order` `refunded` + tickets `cancelled` |
| `_stripe_intent_id` / MP id | `paymentId` (referência) + `paymentGateway=woocommerce-legacy` |
| — | `source=woocommerce`, `allowClientCancel=false` |

### Estorno / cancelamento

| | Pedido **novo** (portal) | Pedido **migrado** (Woo) |
|--|--------------------------|---------------------------|
| Cliente pede cancelamento | Sim (regras do evento) | **Não** — bloqueado no código |
| Estorno automático Stripe/MP | Sim (IDs do portal) | **Não confiável** (conta/plugin antigo) |
| Admin marca estorno manual | Sim | Sim (sem chamar gateway) |

Motivo: intents Stripe/MP do Woo não estão no fluxo do portal; tentar refund daqui falha ou estorna na conta errada.

Cliente migrado: WhatsApp / Contato; admin pode ajustar status se houver acordo.

---

## Teste local (passo a passo)

### 1. MySQL legado

```bash
# criar banco vazio
mysql -u root -p -e "CREATE DATABASE wp_legacy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# importar dump (pode demorar vários minutos)
mysql -u root -p wp_legacy < "C:/Users/aerciompr/Downloads/lord9962_home.sql"
```

No Windows PowerShell, se `mysql` estiver no PATH:

```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS wp_legacy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
cmd /c "mysql -u root -p wp_legacy < C:\Users\aerciompr\Downloads\lord9962_home.sql"
```

### 2. Portal local

```env
# .env do portal
DATABASE_URL=mysql://root:SENHA@127.0.0.1:3306/portal_lorde

# banco WordPress só para o script
WP_DATABASE_URL=mysql://root:SENHA@127.0.0.1:3306/wp_legacy
```

```bash
npx prisma db push
npm run migrate:woocommerce -- --dry-run
npm run migrate:woocommerce -- --limit=50
# depois, sem limit:
npm run migrate:woocommerce
```

Flags:

| Flag | Efeito |
|------|--------|
| `--dry-run` | Só conta / imprime; não grava no portal |
| `--limit=N` | Importa no máximo N pedidos |
| `--since=YYYY-MM-DD` | Só pedidos a partir desta data |
| `--force` | Reimporta (apaga pedidos `source=woocommerce` com mesmo externalId e recria) |

### 3. Validar no portal

- Admin → Pedidos (filtrar por e-mail conhecido do Woo)  
- Meus Ingressos com e-mail + código `LN-…` gerado  
- Pedido migrado: **sem** botão de cancelamento  
- Check-in: tickets `valid` de pedidos `paid`  

### 4. Produção

1. Backup MySQL produção  
2. `prisma db push` (campos `source`, `externalId`, `allowClientCancel`)  
3. Import dump em máquina/VPS temporário ou MySQL auxiliar  
4. Rodar migração com `WP_DATABASE_URL` e `DATABASE_URL` de produção  
5. Smoke  

---

## Limitações aceitas na v1

- QR/códigos antigos do Tribe **não** são reutilizados — geramos códigos novos do portal  
- Eventos passados importados só para histórico/consulta (não venda)  
- Produtos sem `_tribe_wooticket_for_event` caem em evento “Importado Woo (sem evento)”  
- Imagens de cartaz do WP **não** sobem automaticamente (opcional depois)  

---

## Arquivos

- `scripts/migrate-woocommerce.ts` — script  
- `prisma/schema.prisma` — campos de origem  
- `app/api/cancellations` + Meus Ingressos — bloqueio de cancelamento legado  
