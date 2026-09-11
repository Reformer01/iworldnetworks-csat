-- UISP (Ubiquiti network management) integration: sites + devices mirror.
-- Authoritative network inventory replacing the static BTS station list.

CREATE TABLE `UispSite` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NULL,
  `suspended` BOOLEAN NULL,
  `parentId` VARCHAR(191) NULL,
  `parentName` VARCHAR(191) NULL,
  `address` VARCHAR(500) NULL,
  `latitude` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `deviceCount` INTEGER NULL,
  `deviceOutageCount` INTEGER NULL,
  `ucrmId` VARCHAR(191) NULL,
  `lastSyncAt` BIGINT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `UispSite_type_idx` ON `UispSite`(`type`);
CREATE INDEX `UispSite_status_idx` ON `UispSite`(`status`);
CREATE INDEX `UispSite_parentId_idx` ON `UispSite`(`parentId`);
CREATE INDEX `UispSite_name_idx` ON `UispSite`(`name`);

CREATE TABLE `UispDevice` (
  `id` VARCHAR(191) NOT NULL,
  `siteId` VARCHAR(191) NULL,
  `siteName` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NULL,
  `category` VARCHAR(191) NULL,
  `model` VARCHAR(191) NULL,
  `modelName` VARCHAR(191) NULL,
  `mac` VARCHAR(191) NULL,
  `hostname` VARCHAR(191) NULL,
  `firmwareVersion` VARCHAR(191) NULL,
  `authorized` BOOLEAN NOT NULL DEFAULT false,
  `status` VARCHAR(191) NULL,
  `ipAddress` VARCHAR(191) NULL,
  `cpu` DOUBLE NULL,
  `downlinkCapacity` DOUBLE NULL,
  `uplinkCapacity` DOUBLE NULL,
  `downlinkUtilization` DOUBLE NULL,
  `uplinkUtilization` DOUBLE NULL,
  `lastSyncAt` BIGINT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `UispDevice_siteId_idx` ON `UispDevice`(`siteId`);
CREATE INDEX `UispDevice_role_idx` ON `UispDevice`(`role`);
CREATE INDEX `UispDevice_mac_idx` ON `UispDevice`(`mac`);
CREATE INDEX `UispDevice_status_idx` ON `UispDevice`(`status`);

CREATE TABLE `UispMeta` (
  `id` VARCHAR(191) NOT NULL DEFAULT 'sync',
  `lastSyncAt` BIGINT NULL,
  `lastStatus` VARCHAR(191) NULL,
  `lastError` VARCHAR(191) NULL,
  `lastStats` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
