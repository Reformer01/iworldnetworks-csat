-- CreateTable PaystackTransaction for monthly revenue reconciliation
CREATE TABLE `PaystackTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `paystackId` INT NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `amount` INT NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'NGN',
    `status` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NULL,
    `customerEmail` VARCHAR(191) NULL,
    `customerName` VARCHAR(191) NULL,
    `gatewayResponse` TEXT NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `raw` JSON NULL,

    UNIQUE INDEX `PaystackTransaction_paystackId_key`(`paystackId`),
    UNIQUE INDEX `PaystackTransaction_reference_key`(`reference`),
    INDEX `PaystackTransaction_status_idx`(`status`),
    INDEX `PaystackTransaction_paidAt_idx`(`paidAt`),
    INDEX `PaystackTransaction_customerEmail_idx`(`customerEmail`),
    INDEX `PaystackTransaction_reference_idx`(`reference`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
