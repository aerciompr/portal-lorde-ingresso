-- =============================================================================
-- Exportar CSV UTF-8 com cabeçalho → eventos.csv
--
-- FILTRO (ajuste se precisar):
--   • Só eventos PUBLICADOS no site (post_status = publish)
--   • Data de início >= 2026-07-14 (14/07 em diante)
--   • Ainda “vivos”: se tiver end_date, o fim não pode ser anterior a 14/07
--
-- Prefixo: se as tabelas forem wp2_*, troque wp_ por wp2_ em todo o arquivo.
-- =============================================================================

-- >>> Altere aqui se a data base mudar:
-- SET @EVENT_FROM = '2026-07-14 00:00:00';  -- (MySQL session var — use literal abaixo)

SELECT
  e.post_id AS external_id,
  COALESCE(NULLIF(TRIM(p.post_title), ''), CONCAT('Evento ', e.post_id)) AS title,
  COALESCE(NULLIF(TRIM(p.post_name), ''), CONCAT('evento-', e.post_id)) AS slug,
  e.start_date AS date,
  TIME_FORMAT(STR_TO_DATE(e.start_date, '%Y-%m-%d %H:%i:%s'), '%H:%i') AS open_time,
  'Lorde Nelson Rest Pub — Maceió/AL' AS address,
  LEFT(COALESCE(p.post_content, ''), 2000) AS description,
  COALESCE(
    att.guid,
    IF(
      file.meta_value IS NOT NULL AND file.meta_value <> '',
      CONCAT(
        (SELECT option_value FROM wp_options WHERE option_name = 'siteurl' LIMIT 1),
        '/wp-content/uploads/',
        file.meta_value
      ),
      ''
    )
  ) AS image_url
FROM wp_tec_events e
INNER JOIN wp_posts p
  ON p.ID = e.post_id
 AND p.post_type IN ('tribe_events', 'tribe_event', 'event')
 AND p.post_status = 'publish'
LEFT JOIN wp_postmeta thumb
  ON thumb.post_id = e.post_id AND thumb.meta_key = '_thumbnail_id'
LEFT JOIN wp_posts att
  ON att.ID = thumb.meta_value
LEFT JOIN wp_postmeta file
  ON file.post_id = thumb.meta_value AND file.meta_key = '_wp_attached_file'
WHERE
  -- 14/07/2026 em diante (início do evento)
  e.start_date >= '2026-07-14 00:00:00'
  -- se a coluna end_date existir e estiver preenchida, descarta eventos já encerrados antes de 14/07
  AND (
    e.end_date IS NULL
    OR e.end_date = ''
    OR e.end_date = '0000-00-00 00:00:00'
    OR e.end_date >= '2026-07-14 00:00:00'
  )
ORDER BY e.start_date ASC;
