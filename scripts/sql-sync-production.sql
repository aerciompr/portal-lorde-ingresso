-- =============================================================================
-- Sincroniza colunas que o Prisma espera e o MySQL de produção pode não ter.
-- Seguro reexecutar: só ADD se a coluna NÃO existir.
-- Rode no console MySQL do EasyPanel (banco portal_lorde).
-- NÃO apaga dados.
-- =============================================================================

USE `portal_lorde`;

-- Helper: procedure local
DROP PROCEDURE IF EXISTS `ln_add_col`;
DELIMITER $$
CREATE PROCEDURE `ln_add_col`(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_def TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_def);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- ---- Order (erro atual: source) ----
CALL ln_add_col('Order', 'buyerCpf', 'VARCHAR(32) NULL');
CALL ln_add_col('Order', 'buyerPhone', 'VARCHAR(32) NULL');
CALL ln_add_col('Order', 'buyerPasswordHash', 'VARCHAR(255) NULL');
CALL ln_add_col('Order', 'buyerZip', 'VARCHAR(16) NULL');
CALL ln_add_col('Order', 'buyerStreet', 'VARCHAR(255) NULL');
CALL ln_add_col('Order', 'buyerNumber', 'VARCHAR(32) NULL');
CALL ln_add_col('Order', 'buyerComplement', 'VARCHAR(128) NULL');
CALL ln_add_col('Order', 'buyerNeighborhood', 'VARCHAR(128) NULL');
CALL ln_add_col('Order', 'buyerCity', 'VARCHAR(128) NULL');
CALL ln_add_col('Order', 'buyerState', 'VARCHAR(8) NULL');
CALL ln_add_col('Order', 'paymentGateway', 'VARCHAR(64) NULL');
CALL ln_add_col('Order', 'paymentId', 'VARCHAR(191) NULL');
CALL ln_add_col('Order', 'paymentMethod', 'VARCHAR(64) NULL');
CALL ln_add_col('Order', 'accessCode', 'VARCHAR(64) NULL');
CALL ln_add_col('Order', 'paidAt', 'DATETIME(3) NULL');
CALL ln_add_col('Order', 'loteId', 'VARCHAR(191) NULL');
CALL ln_add_col('Order', 'grossCents', 'INT NOT NULL DEFAULT 0');
CALL ln_add_col('Order', 'netCents', 'INT NOT NULL DEFAULT 0');
CALL ln_add_col('Order', 'feeCents', 'INT NOT NULL DEFAULT 0');
CALL ln_add_col('Order', 'feeDetails', 'VARCHAR(255) NULL');
CALL ln_add_col('Order', 'source', 'VARCHAR(32) NOT NULL DEFAULT ''portal''');
CALL ln_add_col('Order', 'externalId', 'VARCHAR(64) NULL');
CALL ln_add_col('Order', 'allowClientCancel', 'TINYINT(1) NOT NULL DEFAULT 1');

-- índices úteis (ignora se já existirem — rode um a um se der erro de duplicate)
-- CREATE INDEX Order_source_externalId_idx ON `Order` (`source`, `externalId`);

-- limpa procedure
DROP PROCEDURE IF EXISTS `ln_add_col`;

-- conferência
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Order'
ORDER BY ORDINAL_POSITION;
