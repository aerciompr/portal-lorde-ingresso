-- Histórico de eventos do pedido (erros de pagamento, e-mails, etc.)
CREATE TABLE IF NOT EXISTS `OrderLog` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(48) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `detail` TEXT NULL,
  `meta` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `OrderLog_orderId_createdAt_idx` (`orderId`, `createdAt`),
  INDEX `OrderLog_kind_idx` (`kind`),
  CONSTRAINT `OrderLog_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
