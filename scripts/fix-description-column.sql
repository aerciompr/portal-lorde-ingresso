-- Rode no MySQL do EasyPanel se criar evento falhar com:
-- "The provided value for the column is too long... Column: description"
--
-- Console do MySQL ou cliente SQL:

ALTER TABLE `Event` MODIFY COLUMN `description` LONGTEXT NULL;
ALTER TABLE `Event` MODIFY COLUMN `footerNotice` TEXT NULL;
ALTER TABLE `Event` MODIFY COLUMN `imageUrl` TEXT NULL;
ALTER TABLE `Setting` MODIFY COLUMN `value` LONGTEXT NOT NULL;
