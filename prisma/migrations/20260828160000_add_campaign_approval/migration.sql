-- AlterTable
ALTER TABLE `Campaign` ADD COLUMN `submittedBy` VARCHAR(191) NULL,
    ADD COLUMN `submittedAt` BIGINT NULL,
    ADD COLUMN `rejectedAt` BIGINT NULL,
    ADD COLUMN `rejectedBy` VARCHAR(191) NULL,
    ADD COLUMN `rejectionReason` TEXT NULL;
