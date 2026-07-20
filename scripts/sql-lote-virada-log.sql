-- Histórico de viradas de lote (admin + e-mail)
-- Rodar no MySQL de produção se prisma db push não estiver disponível.

CREATE TABLE IF NOT EXISTS `LoteViradaLog` (
  `id` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `fromLoteId` VARCHAR(191) NULL,
  `fromLoteNome` VARCHAR(255) NULL,
  `toLoteId` VARCHAR(191) NOT NULL,
  `toLoteNome` VARCHAR(255) NOT NULL,
  `precoCents` INT NOT NULL,
  `source` VARCHAR(16) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `LoteViradaLog_eventId_idx` (`eventId`),
  INDEX `LoteViradaLog_createdAt_idx` (`createdAt`),
  CONSTRAINT `LoteViradaLog_eventId_fkey`
    FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
