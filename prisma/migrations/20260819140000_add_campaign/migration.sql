-- CreateTable
CREATE TABLE `Campaign` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'campaign',
    `subject` VARCHAR(191) NOT NULL,
    `html` TEXT NULL,
    `text` TEXT NOT NULL,
    `audienceJson` JSON NOT NULL,
    `audienceCount` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `sentAt` BIGINT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `approvedAt` BIGINT NULL,
    `approvedBy` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Campaign_status_idx`(`status`),
    INDEX `Campaign_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `EmailJob` ADD COLUMN `campaignId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `EmailJob_campaignId_idx` ON `EmailJob`(`campaignId`);
