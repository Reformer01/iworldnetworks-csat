-- CreateTable
CREATE TABLE `EmailJob` (
    `id` VARCHAR(191) NOT NULL,
    `bullJobId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `customerId` VARCHAR(191) NULL,
    `customerEmail` VARCHAR(255) NULL,
    `customerName` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `result` JSON NULL,
    `error` TEXT NULL,
    `scheduledAt` BIGINT NULL,
    `sentAt` BIGINT NULL,
    `approvedAt` BIGINT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `maxRetries` INTEGER NOT NULL DEFAULT 3,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmailJob_type_idx`(`type`),
    INDEX `EmailJob_status_idx`(`status`),
    INDEX `EmailJob_customerEmail_idx`(`customerEmail`),
    INDEX `EmailJob_createdAt_idx`(`createdAt`),
    INDEX `EmailJob_bullJobId_idx`(`bullJobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;