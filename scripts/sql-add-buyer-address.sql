-- Colunas de endereço do comprador (Stripe billing) — Order
-- Rode no MySQL/MariaDB se o prisma db push não estiver disponível no container.
-- Seguro re-executar: ignora se a coluna já existir (MariaDB 10.3.3+ / MySQL 8 com checagem manual).

-- Preferência: use o painel SQL do EasyPanel / phpMyAdmin / cliente MySQL.

ALTER TABLE `Order` ADD COLUMN `buyerZip` VARCHAR(16) NULL;
ALTER TABLE `Order` ADD COLUMN `buyerStreet` VARCHAR(255) NULL;
ALTER TABLE `Order` ADD COLUMN `buyerNumber` VARCHAR(32) NULL;
ALTER TABLE `Order` ADD COLUMN `buyerComplement` VARCHAR(128) NULL;
ALTER TABLE `Order` ADD COLUMN `buyerNeighborhood` VARCHAR(128) NULL;
ALTER TABLE `Order` ADD COLUMN `buyerCity` VARCHAR(128) NULL;
ALTER TABLE `Order` ADD COLUMN `buyerState` VARCHAR(8) NULL;
