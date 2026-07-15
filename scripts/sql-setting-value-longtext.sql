-- Setting.value precisa ser LONGTEXT para gravar footer_layout (JSON do rodapé).
-- Erro: P2000 "The provided value for the column is too long... Column: value"
--
-- Rode no phpMyAdmin (aba SQL) do banco do portal:

ALTER TABLE `Setting` MODIFY COLUMN `value` LONGTEXT NOT NULL;

-- Confira:
-- SHOW COLUMNS FROM `Setting` LIKE 'value';
-- Type deve ser: longtext
