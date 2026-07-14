-- =============================================================================
-- Exportar CSV UTF-8 com cabeçalho → pedidos.csv
--
-- Só itens de pedidos cujo ingresso pertence a EVENTOS ATIVOS
-- (publish + start_date >= 2026-07-14).
-- Status: completed / processing / refunded.
-- Prefixo: wp_ → wp2_ se necessário.
-- =============================================================================

SELECT
  s.order_id AS external_id,
  ev_meta.meta_value AS event_external_id,
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
-- Ingresso → evento (Tribe)
INNER JOIN wp_postmeta ev_meta
  ON ev_meta.post_id = pl.product_id
 AND ev_meta.meta_key = '_tribe_wooticket_for_event'
 AND ev_meta.meta_value REGEXP '^[0-9]+$'
-- Mesmo filtro de eventos ativos
INNER JOIN wp_tec_events e
  ON e.post_id = CAST(ev_meta.meta_value AS UNSIGNED)
 AND e.start_date >= '2026-07-14 00:00:00'
 AND (
   e.end_date IS NULL
   OR e.end_date = ''
   OR e.end_date = '0000-00-00 00:00:00'
   OR e.end_date >= '2026-07-14 00:00:00'
 )
INNER JOIN wp_posts ep
  ON ep.ID = e.post_id
 AND ep.post_status = 'publish'
WHERE s.parent_id = 0
  AND s.status IN ('wc-completed', 'wc-processing', 'wc-refunded')
ORDER BY s.date_created ASC, s.order_id ASC;
