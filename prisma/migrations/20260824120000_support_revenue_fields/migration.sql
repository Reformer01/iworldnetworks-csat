-- AlterTable
ALTER TABLE `SupportRevenue`
    ADD COLUMN `assignedSalesRep` VARCHAR(191) NULL,
    ADD COLUMN `bandwidthFrom` VARCHAR(191) NULL,
    ADD COLUMN `bandwidthTo` VARCHAR(191) NULL;
