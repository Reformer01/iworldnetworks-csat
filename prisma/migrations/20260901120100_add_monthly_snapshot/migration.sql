-- CreateTable
CREATE TABLE `MonthlySnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(191) NOT NULL,
    `workbook03` JSON NOT NULL,
    `workbook01` JSON NULL,
    `workbook02` JSON NULL,
    `workbook04` JSON NULL,
    `savedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MonthlySnapshot_month_key`(`month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RiskRegisterEntry` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NULL,
    `mrr` DOUBLE NULL,
    `riskLevel` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `actionTaken` TEXT NULL,
    `outcome` TEXT NULL,
    `nextReview` VARCHAR(191) NULL,
    `owner` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RiskRegisterEntry_customerId_key`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
