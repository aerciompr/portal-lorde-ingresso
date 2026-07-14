# Migração WooCommerce por CSV (recomendado)

Fluxo:

1. Rodar as queries no **MySQL do WordPress** (phpMyAdmin, HeidiSQL, DBeaver, CLI)  
2. Exportar resultado como **CSV (UTF-8)**  
3. No portal: **Admin → Importação**  
4. **Etapa 1:** enviar `eventos.csv` → **pré-visualizar** → confirmar  
5. **Etapa 2:** enviar `pedidos.csv` → **pré-visualizar** → confirmar  

Pedidos importados ficam com:

- `source = woocommerce`  
- `allowClientCancel = false` (cliente **não** pede cancelamento no portal)  

---

## 1. Exportar eventos → `eventos.csv`

Execute no banco WordPress (`wp_` = prefixo; ajuste se for outro):

```sql
SELECT
  e.post_id AS external_id,
  COALESCE(NULLIF(TRIM(p.post_title), ''), CONCAT('Evento ', e.post_id)) AS title,
  COALESCE(NULLIF(TRIM(p.post_name), ''), CONCAT('evento-', e.post_id)) AS slug,
  e.start_date AS date,
  TIME_FORMAT(STR_TO_DATE(e.start_date, '%Y-%m-%d %H:%i:%s'), '%H:%i') AS open_time,
  'Lorde Nelson Rest Pub — Maceió/AL' AS address,
  LEFT(COALESCE(p.post_content, ''), 2000) AS description
FROM wp_tec_events e
LEFT JOIN wp_posts p ON p.ID = e.post_id
ORDER BY e.start_date ASC;
```

**Exportar CSV** com cabeçalho (primeira linha = nomes das colunas).

Colunas esperadas pelo portal:

| Coluna | Obrigatório | Exemplo |
|--------|-------------|---------|
| `external_id` | sim | `52024` (ID do post do evento no WP) |
| `title` | sim | `Aniversário da Parabrisas` |
| `slug` | não | `aniversario-parabrisas` |
| `date` | sim | `2024-12-14 20:00:00` |
| `open_time` | não | `20:00` |
| `address` | não | endereço |
| `description` | não | texto |

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
