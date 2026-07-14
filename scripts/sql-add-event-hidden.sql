-- Evento oculto (exclusivo) — não lista na home/programação
-- Rode no MySQL de produção se prisma db push não estiver disponível.

ALTER TABLE `Event` ADD COLUMN `hidden` TINYINT(1) NOT NULL DEFAULT 0;
