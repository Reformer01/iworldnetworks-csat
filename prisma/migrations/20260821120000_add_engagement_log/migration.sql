-- CreateTable
CREATE TABLE `EngagementLog` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `btsName` VARCHAR(191) NULL,
    `accountStatus` VARCHAR(191) NULL,
    `accountType` VARCHAR(191) NULL,
    `plan` VARCHAR(191) NULL,
    `region` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `callStatus` VARCHAR(191) NULL,
    `lastContactAt` DATETIME(3) NULL,
    `nextFollowUpAt` DATETIME(3) NULL,
    `purpose` VARCHAR(191) NULL,
    `feedback` LONGTEXT NULL,
    `complaint` VARCHAR(191) NULL,
    `upsellNote` LONGTEXT NULL,
    `retentionRisk` VARCHAR(191) NULL,
    `resolution` VARCHAR(191) NULL,
    `staffName` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `EngagementLog_staffName_idx`(`staffName`),
    INDEX `EngagementLog_customerId_idx`(`customerId`),
    INDEX `EngagementLog_lastContactAt_idx`(`lastContactAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
