-- Schema MySQL para cPanel (sem engine Rust do Prisma)
-- Aplicar: node scripts/db-push-cpanel.js
-- ou: mysql -u USER -p DB < prisma/cpanel-init.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `Event` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `date` DATETIME(3) NOT NULL,
  `openTime` VARCHAR(191) NULL,
  `address` VARCHAR(500) NOT NULL DEFAULT 'Rua Silvério Jorge, 241, Jaraguá, Maceió - AL, 57022-110',
  `location` VARCHAR(191) NULL,
  `imageUrl` TEXT NULL,
  `salesDeadline` DATETIME(3) NULL,
  `footerNotice` TEXT NULL,
  `allowCancel` TINYINT(1) NOT NULL DEFAULT 1,
  `cancelHoursBefore` INT NOT NULL DEFAULT 24,
  `cancelFeePercent` DOUBLE NOT NULL DEFAULT 10,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `activeLoteId` VARCHAR(191) NULL,
  `loteAcrescimoCents` INT NOT NULL DEFAULT 500,
  `loteDefaultQty` INT NOT NULL DEFAULT 50,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Event_slug_key` (`slug`),
  UNIQUE KEY `Event_activeLoteId_key` (`activeLoteId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Lote` (
  `id` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `nome` VARCHAR(191) NOT NULL,
  `precoCents` INT NOT NULL,
  `totalQty` INT NOT NULL,
  `sold` INT NOT NULL DEFAULT 0,
  `ordem` INT NOT NULL,
  `viradaAutomatica` TINYINT(1) NOT NULL DEFAULT 1,
  `ativo` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Lote_eventId_idx` (`eventId`),
  CONSTRAINT `Lote_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- FK circular Event.activeLote -> Lote (só se ainda não existir)
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Event'
    AND CONSTRAINT_NAME = 'Event_activeLoteId_fkey'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE `Event` ADD CONSTRAINT `Event_activeLoteId_fkey` FOREIGN KEY (`activeLoteId`) REFERENCES `Lote` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `TicketType` (
  `id` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `priceCents` INT NOT NULL,
  `totalQty` INT NOT NULL,
  `sold` INT NOT NULL DEFAULT 0,
  `salesEndAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  KEY `TicketType_eventId_idx` (`eventId`),
  CONSTRAINT `TicketType_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Order` (
  `id` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `buyerName` VARCHAR(191) NOT NULL,
  `buyerEmail` VARCHAR(191) NOT NULL,
  `buyerCpf` VARCHAR(191) NULL,
  `buyerPhone` VARCHAR(191) NULL,
  `buyerPasswordHash` VARCHAR(191) NULL,
  `totalCents` INT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `paymentGateway` VARCHAR(191) NULL,
  `paymentId` VARCHAR(191) NULL,
  `paymentMethod` VARCHAR(191) NULL,
  `accessCode` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `paidAt` DATETIME(3) NULL,
  `loteId` VARCHAR(191) NULL,
  `grossCents` INT NOT NULL DEFAULT 0,
  `netCents` INT NOT NULL DEFAULT 0,
  `feeCents` INT NOT NULL DEFAULT 0,
  `feeDetails` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Order_accessCode_key` (`accessCode`),
  KEY `Order_eventId_idx` (`eventId`),
  KEY `Order_loteId_idx` (`loteId`),
  CONSTRAINT `Order_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Order_loteId_fkey` FOREIGN KEY (`loteId`) REFERENCES `Lote` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Ticket` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `ticketTypeId` VARCHAR(191) NOT NULL,
  `uniqueCode` VARCHAR(191) NOT NULL,
  `qrPayload` TEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'valid',
  `checkedInAt` DATETIME(3) NULL,
  `checkedInBy` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Ticket_uniqueCode_key` (`uniqueCode`),
  KEY `Ticket_uniqueCode_idx` (`uniqueCode`),
  KEY `Ticket_orderId_idx` (`orderId`),
  KEY `Ticket_ticketTypeId_idx` (`ticketTypeId`),
  CONSTRAINT `Ticket_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Ticket_ticketTypeId_fkey` FOREIGN KEY (`ticketTypeId`) REFERENCES `TicketType` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `CancellationRequest` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `reason` TEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `adminNotes` TEXT NULL,
  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  KEY `CancellationRequest_orderId_idx` (`orderId`),
  CONSTRAINT `CancellationRequest_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Setting` (
  `key` VARCHAR(191) NOT NULL,
  `value` TEXT NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
