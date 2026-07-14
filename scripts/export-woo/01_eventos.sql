-- Exportar como CSV UTF-8 com cabeçalho → eventos.csv
-- Ajuste o prefixo wp_ se necessário.

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
