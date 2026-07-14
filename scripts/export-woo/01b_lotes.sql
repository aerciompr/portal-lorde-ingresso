-- =============================================================================
-- Exportar CSV UTF-8 com cabeçalho → lotes.csv
--
-- Só lotes/produtos de ingresso ligados a EVENTOS ATIVOS:
--   • evento publish
--   • start_date >= 2026-07-14
--
-- Cada produto Event Tickets (Tribe) = um lote/tipo de ingresso.
-- sold_out = 1 se outofstock ou stock<=0 com manage_stock.
-- Prefixo: wp_ → wp2_ se necessário.
-- =============================================================================

SELECT
  p.ID AS product_external_id,
  ev_meta.meta_value AS event_external_id,
  p.post_title AS nome,
  COALESCE(
    (
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = p.ID AND meta_key = '_price' LIMIT 1
    ),
    (
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = p.ID AND meta_key = '_regular_price' LIMIT 1
    ),
    '0'
  ) AS price,
  COALESCE(
    (
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = p.ID AND meta_key = '_tribe_ticket_capacity' LIMIT 1
    ),
    (
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = p.ID AND meta_key = '_stock' LIMIT 1
    ),
    '0'
  ) AS capacity,
  COALESCE(
    (
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = p.ID AND meta_key = '_stock' LIMIT 1
    ),
    '0'
  ) AS stock,
  (
    SELECT meta_value FROM wp_postmeta
    WHERE post_id = p.ID AND meta_key = '_stock_status' LIMIT 1
  ) AS stock_status,
  CASE
    WHEN (
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = p.ID AND meta_key = '_stock_status' LIMIT 1
    ) = 'outofstock' THEN 1
    WHEN CAST(COALESCE((
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = p.ID AND meta_key = '_stock' LIMIT 1
    ), '0') AS SIGNED) <= 0
     AND (
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = p.ID AND meta_key = '_manage_stock' LIMIT 1
    ) = 'yes' THEN 1
    ELSE 0
  END AS sold_out,
  GREATEST(
    0,
    CAST(COALESCE((
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = p.ID AND meta_key = '_tribe_ticket_capacity' LIMIT 1
    ), '0') AS SIGNED)
    - CAST(COALESCE((
      SELECT meta_value FROM wp_postmeta
      WHERE post_id = p.ID AND meta_key = '_stock' LIMIT 1
    ), '0') AS SIGNED)
  ) AS sold,
  p.post_status AS product_status
FROM wp_posts p
INNER JOIN wp_postmeta ev_meta
  ON ev_meta.post_id = p.ID
 AND ev_meta.meta_key = '_tribe_wooticket_for_event'
 AND ev_meta.meta_value REGEXP '^[0-9]+$'
-- Evento ativo (mesma regra de 01_eventos.sql)
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
WHERE p.post_type = 'product'
  AND p.post_status IN ('publish', 'private')
ORDER BY CAST(ev_meta.meta_value AS UNSIGNED) ASC, p.ID ASC;
