-- Unified customer-BTS matching (Leaf A): Customer gains UISP tower/endpoint
-- attribution and match bookkeeping; new reconciliation + webhook tables.

-- AlterTable
ALTER TABLE `Customer`
  ADD COLUMN `btsId` VARCHAR(191) NULL,
  ADD COLUMN `btsName` VARCHAR(191) NULL,
  ADD COLUMN `uispEndpointId` VARCHAR(191) NULL,
  ADD COLUMN `uispEndpointName` VARCHAR(191) NULL,
  ADD COLUMN `uispDeviceStatus` VARCHAR(191) NULL,
  ADD COLUMN `uispOutageCount` INTEGER NULL,
  ADD COLUMN `matchState` VARCHAR(191) NOT NULL DEFAULT 'pending',
  ADD COLUMN `matchMethod` VARCHAR(191) NULL,
  ADD COLUMN `matchScore` DOUBLE NULL,
  ADD COLUMN `matchedAt` BIGINT NULL,
  ADD COLUMN `matchUpdatedAt` BIGINT NULL;

-- CreateIndex
CREATE INDEX `Customer_btsId_idx` ON `Customer`(`btsId`);

-- CreateIndex
CREATE INDEX `Customer_matchState_idx` ON `Customer`(`matchState`);

-- CreateTable
CREATE TABLE `ReconciliationLog` (
  `id` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `recordId` VARCHAR(191) NOT NULL,
  `field` VARCHAR(191) NOT NULL,
  `beforeValue` JSON NULL,
  `afterValue` JSON NULL,
  `action` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(191) NULL,
  `createdAt` BIGINT NOT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAtDb` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ReconciliationLog_recordId_idx` ON `ReconciliationLog`(`recordId`);

-- CreateIndex
CREATE INDEX `ReconciliationLog_kind_idx` ON `ReconciliationLog`(`kind`);

-- CreateTable
CREATE TABLE `UispWebhookEvent` (
  `id` VARCHAR(191) NOT NULL,
  `eventType` VARCHAR(191) NULL,
  `payload` JSON NULL,
  `processedAt` BIGINT NULL,
  `error` VARCHAR(191) NULL,
  `createdAt` BIGINT NOT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable (Leaf B): UISP site contact/note/sla fields for matching.
ALTER TABLE `UispSite`
  ADD COLUMN `contactName` VARCHAR(191) NULL,
  ADD COLUMN `contactPhone` VARCHAR(191) NULL,
  ADD COLUMN `contactEmail` VARCHAR(191) NULL,
  ADD COLUMN `note` TEXT NULL,
  ADD COLUMN `sla` DOUBLE NULL;
