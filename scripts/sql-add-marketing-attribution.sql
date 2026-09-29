-- Migração cirúrgica de atribuição de marketing.
-- Segura para produção: só adiciona colunas/índices ausentes; não altera ou remove dados existentes.
-- Pode ser executada mais de uma vez.

SET @db := DATABASE();

SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'utmSource') = 0,
  'ALTER TABLE `Order` ADD COLUMN `utmSource` VARCHAR(255) NULL', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'utmMedium') = 0,
  'ALTER TABLE `Order` ADD COLUMN `utmMedium` VARCHAR(255) NULL', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'utmCampaign') = 0,
  'ALTER TABLE `Order` ADD COLUMN `utmCampaign` VARCHAR(255) NULL', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'utmContent') = 0,
  'ALTER TABLE `Order` ADD COLUMN `utmContent` VARCHAR(255) NULL', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'utmTerm') = 0,
  'ALTER TABLE `Order` ADD COLUMN `utmTerm` VARCHAR(255) NULL', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'gclid') = 0,
  'ALTER TABLE `Order` ADD COLUMN `gclid` VARCHAR(255) NULL', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'fbclid') = 0,
  'ALTER TABLE `Order` ADD COLUMN `fbclid` VARCHAR(255) NULL', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'landingPage') = 0,
  'ALTER TABLE `Order` ADD COLUMN `landingPage` VARCHAR(500) NULL', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Order' AND COLUMN_NAME = 'referrer') = 0,
  'ALTER TABLE `Order` ADD COLUMN `referrer` VARCHAR(500) NULL', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Order' AND INDEX_NAME = 'Order_paidAt_idx') = 0,
  'CREATE INDEX `Order_paidAt_idx` ON `Order` (`paidAt`)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'Order' AND INDEX_NAME = 'Order_status_paidAt_idx') = 0,
  'CREATE INDEX `Order_status_paidAt_idx` ON `Order` (`status`, `paidAt`)', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
