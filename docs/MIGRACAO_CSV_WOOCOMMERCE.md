# Migração WooCommerce por CSV (recomendado)

Fluxo:

1. Rodar as queries no **MySQL do WordPress** (arquivos em `scripts/export-woo/`)  
2. Exportar cada resultado como **CSV (UTF-8)**  
3. No portal: **Admin → Importação CSV**  
4. **Etapa 1 — Eventos:** `eventos.csv` → pré-visualizar (inclui thumbnails) → importar **com download de fotos**  
5. **Etapa 2 — Lotes:** `lotes.csv` → preços reais, capacity/stock, **esgotados** → importar  
6. **Etapa 3 — Pedidos:** `pedidos.csv` → pré-visualizar → importar  

Pedidos importados:

- `source = woocommerce`  
- `allowClientCancel = false` (sem cancelamento self-service)  

---

## 1. Exportar eventos → `eventos.csv`

Arquivo pronto: **`scripts/export-woo/01_eventos.sql`** (inclui `image_url` da thumbnail).

Colunas:

| Coluna | Obrigatório | Exemplo |
|--------|-------------|---------|
| `external_id` | sim | `62737` |
| `title` | sim | `Aniversário da Parabrisas` |
| `slug` | não | |
| `date` | sim | `2026-08-14 20:00:00` |
| `open_time` | não | `20:00` |
| `address` | não | |
| `description` | não | |
| `image_url` | não | `https://www.lordenelson.com.br/wp-content/uploads/...` |

No import, marque **Baixar fotos dos eventos** para copiar a imagem para o storage do portal.

---

## 1b. Exportar lotes → `lotes.csv`

Arquivo: **`scripts/export-woo/01b_lotes.sql`**

Cada produto Event Tickets (ex.: “Evento - Lote Promocional”) vira **Lote + TicketType** com:

| Coluna | Significado |
|--------|-------------|
| `product_external_id` | ID do produto Woo |
| `event_external_id` | ID do evento WP |
| `nome` | Título do produto/lote |
| `price` | Preço real cadastrado (`_price`) |
| `capacity` | Capacidade Tribe |
| `stock` | Estoque restante |
| `sold` | capacity − stock (aprox.) |
| `sold_out` | 1 se esgotado |
| `stock_status` | `instock` / `outofstock` |

Lotes esgotados: `ativo = false` no portal.

---

## 2. Exportar pedidos vendidos → `pedidos.csv`

Uma **linha por item** do pedido (qty > 0). Status: completed / processing / refunded.

```sql
SELECT
  s.order_id AS external_id,
  COALESCE(
    (
      SELECT pm.meta_value
      FROM wp_postmeta pm
      WHERE pm.post_id = pl.product_id
        AND pm.meta_key = '_tribe_wooticket_for_event'
      LIMIT 1
    ),
    ''
  ) AS event_external_id,
  COALESCE(
    (
      SELECT p.post_title FROM wp_posts p WHERE p.ID = pl.product_id LIMIT 1
    ),
    CONCAT('Produto ', pl.product_id)
  ) AS ticket_name,
  ROUND(pl.product_gross_revenue / NULLIF(pl.product_qty, 0), 2) AS price,
  pl.product_qty AS qty,
  TRIM(CONCAT(
    COALESCE((
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = s.order_id AND meta_key = '_billing_first_name' LIMIT 1
    ), ''),
    ' ',
    COALESCE((
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = s.order_id AND meta_key = '_billing_last_name' LIMIT 1
    ), '')
  )) AS buyer_name,
  LOWER(TRIM(COALESCE((
    SELECT meta_value FROM wp_postmeta
    WHERE post_id = s.order_id AND meta_key = '_billing_email' LIMIT 1
  ), CONCAT('woo-', s.order_id, '@import.local')))) AS buyer_email,
  COALESCE((
    SELECT meta_value FROM wp_postmeta
    WHERE post_id = s.order_id AND meta_key = '_billing_phone' LIMIT 1
  ), '') AS buyer_phone,
  COALESCE((
    SELECT meta_value FROM wp_postmeta
    WHERE post_id = s.order_id AND meta_key = '_billing_cpf' LIMIT 1
  ), '') AS buyer_cpf,
  REPLACE(s.status, 'wc-', '') AS status,
  IF(s.date_paid IS NULL OR s.date_paid = '0000-00-00 00:00:00',
     s.date_created, s.date_paid) AS paid_at,
  s.date_created AS created_at,
  COALESCE((
    SELECT meta_value FROM wp_postmeta
    WHERE post_id = s.order_id AND meta_key = '_payment_method' LIMIT 1
  ), '') AS payment_method,
  COALESCE((
    SELECT meta_value FROM wp_postmeta
    WHERE post_id = s.order_id AND meta_key = '_stripe_intent_id' LIMIT 1
  ), COALESCE((
    SELECT meta_value FROM wp_postmeta
    WHERE post_id = s.order_id AND meta_key = '_transaction_id' LIMIT 1
  ), '')) AS payment_id,
  pl.product_id AS product_external_id
FROM wp_wc_order_stats s
INNER JOIN wp_wc_order_product_lookup pl ON pl.order_id = s.order_id
WHERE s.parent_id = 0
  AND pl.product_qty > 0
  AND s.status IN ('wc-completed', 'wc-processing', 'wc-refunded')
ORDER BY s.date_created ASC, s.order_id ASC;
```

### Só pedidos recentes (opcional)

Acrescente no `WHERE`:

```sql
  AND s.date_created >= '2024-01-01'
```

### Colunas esperadas

| Coluna | Obrigatório | Notas |
|--------|-------------|-------|
| `external_id` | sim | ID do pedido Woo |
| `event_external_id` | sim* | ID do evento WP (`_tribe_wooticket_for_event`). *Se vazio, usa evento “Importado Woo” |
| `ticket_name` | sim | Nome do ingresso/produto |
| `price` | sim | Preço unitário em reais (`50` ou `50.00`) |
| `qty` | sim | Quantidade |
| `buyer_name` | sim | |
| `buyer_email` | sim | |
| `buyer_phone` | não | |
| `buyer_cpf` | não | |
| `status` | sim | `completed`, `processing`, `refunded` (ou `paid`) |
| `paid_at` | não | |
| `created_at` | não | |
| `payment_method` | não | |
| `payment_id` | não | só referência; **não** estorna pelo portal |
| `product_external_id` | não | agrupa tipo de ingresso |

---

## 3. Como exportar no MySQL CLI

```bash
mysql -u USUARIO -p NOME_BANCO_WP -e "SELECT ... " --batch --raw > eventos.csv
```

Ou no **phpMyAdmin**: Executar SQL → Exportar → CSV.

Salve como UTF-8. Separador: vírgula ou ponto-e-vírgula (o portal aceita os dois).

---

## 4. No portal (local ou produção)

1. `npx prisma db push` (campos `source`, `externalId`, `allowClientCancel`)  
2. Admin → **Importação**  
3. Aba **1. Eventos** → escolher CSV → **Pré-visualizar** → confira a tabela → **Importar eventos**  
4. Aba **2. Pedidos** → CSV → **Pré-visualizar** → confira → **Importar pedidos**  

Reimportar o mesmo `external_id` é **ignorado** (não duplica), salvo se marcar “substituir existentes”.

---

## 5. Checklist pós-import

- [ ] Admin → Eventos: contagem bate com o CSV  
- [ ] Admin → Pedidos: amostra de e-mails  
- [ ] Meus Ingressos: e-mail + código `LN-W…`  
- [ ] Pedido migrado **sem** botão cancelar  
- [ ] Check-in: tickets `valid`  

---

## Arquivos no projeto

| Arquivo | Função |
|---------|--------|
| `docs/MIGRACAO_CSV_WOOCOMMERCE.md` | Este guia + SQL |
| `app/admin/importacao/page.tsx` | UI preview + import |
| `app/api/admin/import/*` | APIs |
| `lib/csv-woo-import.ts` | Parse e regras |
