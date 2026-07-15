-- Cupons promocionais (PromoCode + PromoRedemption + colunas em Order)
-- Rodar no phpMyAdmin (aba SQL) do banco de produção.
-- Se alguma coluna já existir, o ALTER pode dar erro — ignore só essa linha e continue.

CREATE TABLE IF NOT EXISTS `PromoCode` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NULL,
  `description` TEXT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `eventId` VARCHAR(191) NULL,
  `discountType` VARCHAR(32) NOT NULL,
  `discountValue` INT NOT NULL,
  `minTickets` INT NULL,
  `maxTicketsDiscounted` INT NULL,
  `minSubtotalCents` INT NULL,
  `maxUses` INT NULL,
  `maxUsesPerEmail` INT NULL,
  `reservedUses` INT NOT NULL DEFAULT 0,
  `redeemedUses` INT NOT NULL DEFAULT 0,
  `startsAt` DATETIME(3) NULL,
  `endsAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PromoCode_code_key` (`code`),
  INDEX `PromoCode_active_code_idx` (`active`, `code`),
  INDEX `PromoCode_eventId_idx` (`eventId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FK evento (opcional — se falhar por collation, a tabela já serve sem FK)
-- ALTER TABLE `PromoCode` ADD CONSTRAINT `PromoCode_eventId_fkey`
--   FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `PromoRedemption` (
  `id` VARCHAR(191) NOT NULL,
  `promoCodeId` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `buyerEmail` VARCHAR(255) NULL,
  `discountCents` INT NOT NULL,
  `ticketQty` INT NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `appliedAt` DATETIME(3) NULL,
  `releasedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PromoRedemption_orderId_key` (`orderId`),
  INDEX `PromoRedemption_promoCodeId_status_idx` (`promoCodeId`, `status`),
  INDEX `PromoRedemption_buyerEmail_promoCodeId_idx` (`buyerEmail`, `promoCodeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Colunas no pedido (rode uma de cada vez se der "Duplicate column")
ALTER TABLE `Order` ADD COLUMN `promoCodeId` VARCHAR(191) NULL;
ALTER TABLE `Order` ADD COLUMN `promoCodeLabel` VARCHAR(64) NULL;
ALTER TABLE `Order` ADD COLUMN `discountCents` INT NOT NULL DEFAULT 0;

-- Índice (ignore se já existir)
ALTER TABLE `Order` ADD INDEX `Order_promoCodeId_idx` (`promoCodeId`);
