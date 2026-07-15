-- =============================================================================
-- Exportar UM pedido Woo → CSV UTF-8 → pedidos-um.csv
--
-- 1) Troque 99999 pelo ID do pedido no Woo (admin Woo → Pedidos → #ID)
-- 2) Rode no MySQL do WordPress
-- 3) Exportar CSV com cabeçalho
-- 4) Portal: Admin → Importação CSV → 3. Pedidos → pré-visualizar → importar
--
-- Prefixo: se for wp2_, troque wp_ por wp2_
-- =============================================================================

-- >>> ID DO PEDIDO NO WOOCOMMERCE:
SET @ORDER_ID = 99999;

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
INNER JOIN wp_wc_order_product_lookup pl
  ON pl.order_id = s.order_id
 AND pl.product_qty > 0
WHERE s.parent_id = 0
  AND s.order_id = @ORDER_ID
  AND s.status IN ('wc-completed', 'wc-processing', 'wc-refunded', 'wc-on-hold')
ORDER BY pl.order_item_id ASC;
