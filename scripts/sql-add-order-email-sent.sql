-- Data do último e-mail de ingresso enviado
ALTER TABLE `Order` ADD COLUMN `emailSentAt` DATETIME(3) NULL;
