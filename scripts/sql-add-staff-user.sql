-- Usuários staff (admin / check-in)
-- Rode no MySQL se prisma db push não estiver disponível no container.

CREATE TABLE IF NOT EXISTS `StaffUser` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(32) NOT NULL DEFAULT 'checkin',
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `lastLoginAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `StaffUser_email_key` (`email`),
  INDEX `StaffUser_role_idx` (`role`),
  INDEX `StaffUser_active_idx` (`active`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
