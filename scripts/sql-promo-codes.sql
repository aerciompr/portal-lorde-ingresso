-- Cupons promocionais (PromoCode + PromoRedemption + colunas em Order)
-- Rodar no MySQL de produção se o container não fez prisma db push.

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
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PromoCode_code_key` (`code`),
  INDEX `PromoCode_active_code_idx` (`active`, `code`),
  INDEX `PromoCode_eventId_idx` (`eventId`),
  CONSTRAINT `PromoCode_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
  INDEX `PromoRedemption_buyerEmail_promoCodeId_idx` (`buyerEmail`, `promoCodeId`),
  CONSTRAINT `PromoRedemption_promoCodeId_fkey`
    FOREIGN KEY (`promoCodeId`) REFERENCES `PromoCode`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PromoRedemption_orderId_fkey`
    FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Colunas no pedido (ignorar erro se já existirem)
ALTER TABLE `Order` ADD COLUMN `promoCodeId` VARCHAR(191) NULL;
ALTER TABLE `Order` ADD COLUMN `promoCodeLabel` VARCHAR(64) NULL;
ALTER TABLE `Order` ADD COLUMN `discountCents` INT NOT NULL DEFAULT 0;
ALTER TABLE `Order` ADD INDEX `Order_promoCodeId_idx` (`promoCodeId`);
ALTER TABLE `Order`
  ADD CONSTRAINT `Order_promoCodeId_fkey`
  FOREIGN KEY (`promoCodeId`) REFERENCES `PromoCode`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
