-- AlterTable: first-response tracking for support tickets
ALTER TABLE `Ticket` ADD COLUMN `firstResponseAt` BIGINT NULL;
