-- Exportar CSV UTF-8 com cabeçalho → eventos.csv
-- Inclui URL da imagem destacada (thumbnail) do evento.

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
LEFT JOIN wp_posts p ON p.ID = e.post_id
LEFT JOIN wp_postmeta thumb ON thumb.post_id = e.post_id AND thumb.meta_key = '_thumbnail_id'
LEFT JOIN wp_posts att ON att.ID = thumb.meta_value
LEFT JOIN wp_postmeta file ON file.post_id = thumb.meta_value AND file.meta_key = '_wp_attached_file'
ORDER BY e.start_date ASC;
