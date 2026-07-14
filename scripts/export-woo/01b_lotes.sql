-- Exportar CSV UTF-8 com cabeçalho → lotes.csv
-- Cada produto Event Tickets (Tribe) = um lote/tipo de ingresso.
-- capacity = total; stock = restante; sold = capacity - stock (quando gerencia estoque).
-- sold_out = 1 se outofstock ou stock<=0.

SELECT
  p.ID AS product_external_id,
  (
    SELECT meta_value FROM wp_postmeta
    WHERE post_id = p.ID AND meta_key = '_tribe_wooticket_for_event' LIMIT 1
  ) AS event_external_id,
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
  -- sold aproximado: capacity - stock (se ambos numéricos)
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
WHERE p.post_type = 'product'
  AND p.post_status IN ('publish', 'private', 'draft')
  AND EXISTS (
    SELECT 1 FROM wp_postmeta m
    WHERE m.post_id = p.ID
      AND m.meta_key = '_tribe_wooticket_for_event'
      AND m.meta_value REGEXP '^[0-9]+$'
  )
ORDER BY event_external_id ASC, p.ID ASC;
