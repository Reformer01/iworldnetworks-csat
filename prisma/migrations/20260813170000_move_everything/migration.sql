-- Move everything to MariaDB: remaining Firestore-only data collections
-- (tickets, support_revenue, staff_kpi_records, splynx bts sync, audit log,
-- nonces) become MariaDB tables. ChurnSurvey gains clientIp for parity with
-- the Firestore churn_surveys docs.

ALTER TABLE `ChurnSurvey` ADD COLUMN `clientIp` VARCHAR(191) NULL;

CREATE TABLE `Ticket` (
  `id` VARCHAR(191) NOT NULL,
  `ticketNumber` INTEGER NOT NULL,
  `customerName` VARCHAR(191) NULL,
  `customerPhone` VARCHAR(191) NULL,
  `customerEmail` VARCHAR(255) NULL,
  `location` VARCHAR(191) NULL,
  `region` VARCHAR(191) NULL,
  `bts` VARCHAR(191) NULL,
  `complaintType` VARCHAR(191) NULL,
  `description` TEXT NULL,
  `createdBy` VARCHAR(191) NULL,
  `assignedTo` VARCHAR(191) NULL,
  `escalatedTo` VARCHAR(191) NULL,
  `status` VARCHAR(191) NULL,
  `createdAt` BIGINT NULL,
  `assignedAt` BIGINT NULL,
  `escalatedAt` BIGINT NULL,
  `resolvedAt` BIGINT NULL,
  `closedAt` BIGINT NULL,
  `reopenedAt` BIGINT NULL,
  `reopenedCount` INTEGER NULL,
  `slaBreached` BOOLEAN NULL,
  `resolutionNotes` TEXT NULL,
  `firstTimeFix` BOOLEAN NULL,
  `priority` INTEGER NULL,
  `delayReasons` JSON NULL,
  `delayNotes` TEXT NULL,
  `followUps` JSON NULL,
  `createdByAgent` VARCHAR(191) NULL,
  `updatedAt` BIGINT NULL,
  `deletedAt` BIGINT NULL,
  `lastSyncAt` BIGINT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAtDb` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Ticket_ticketNumber_idx` ON `Ticket`(`ticketNumber`);
CREATE INDEX `Ticket_status_idx` ON `Ticket`(`status`);
CREATE INDEX `Ticket_assignedTo_idx` ON `Ticket`(`assignedTo`);
CREATE INDEX `Ticket_deletedAt_idx` ON `Ticket`(`deletedAt`);
CREATE INDEX `Ticket_createdAt_idx` ON `Ticket`(`createdAt`);

CREATE TABLE `SupportRevenue` (
  `id` VARCHAR(191) NOT NULL,
  `customerName` VARCHAR(191) NULL,
  `location` VARCHAR(191) NULL,
  `region` VARCHAR(191) NULL,
  `projectType` VARCHAR(191) NULL,
  `items` JSON NULL,
  `totalAmount` DOUBLE NULL,
  `description` TEXT NULL,
  `notes` TEXT NULL,
  `date` VARCHAR(191) NULL,
  `agentName` VARCHAR(191) NULL,
  `createdAt` BIGINT NULL,
  `updatedAt` BIGINT NULL,
  `deletedAt` BIGINT NULL,
  `lastSyncAt` BIGINT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAtDb` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SupportRevenue_projectType_idx` ON `SupportRevenue`(`projectType`);
CREATE INDEX `SupportRevenue_region_idx` ON `SupportRevenue`(`region`);
CREATE INDEX `SupportRevenue_deletedAt_idx` ON `SupportRevenue`(`deletedAt`);
CREATE INDEX `SupportRevenue_createdAt_idx` ON `SupportRevenue`(`createdAt`);

CREATE TABLE `StaffKpiRecord` (
  `id` VARCHAR(191) NOT NULL,
  `staffId` VARCHAR(191) NOT NULL,
  `staffName` VARCHAR(191) NULL,
  `role` VARCHAR(191) NULL,
  `periodStart` BIGINT NOT NULL,
  `periodEnd` BIGINT NOT NULL,
  `ticketsAssigned` INTEGER NULL,
  `ticketsResolved` INTEGER NULL,
  `ticketsEscalated` INTEGER NULL,
  `ticketsReopened` INTEGER NULL,
  `ticketsClosed` INTEGER NULL,
  `avgResolutionTimeHours` DOUBLE NULL,
  `avgFirstResponseTimeHours` DOUBLE NULL,
  `avgTimeToAssignHours` DOUBLE NULL,
  `slaComplianceRate` DOUBLE NULL,
  `firstContactResolutionRate` DOUBLE NULL,
  `customerSatisfactionScore` DOUBLE NULL,
  `avgCustomerSatisfaction` DOUBLE NULL,
  `qualityScore` DOUBLE NULL,
  `slaBreaches` INTEGER NULL,
  `slaBreachRate` DOUBLE NULL,
  `priority1Resolved` INTEGER NULL,
  `priority2Resolved` INTEGER NULL,
  `priority3Resolved` INTEGER NULL,
  `currentOpenTickets` INTEGER NULL,
  `avgDailyTickets` DOUBLE NULL,
  `calculatedAt` BIGINT NULL,
  `lastSyncAt` BIGINT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAtDb` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `StaffKpiRecord_staffId_idx` ON `StaffKpiRecord`(`staffId`);
CREATE INDEX `StaffKpiRecord_periodStart_idx` ON `StaffKpiRecord`(`periodStart`);

CREATE TABLE `SplynxBtsSyncMeta` (
  `id` VARCHAR(191) NOT NULL,
  `totalActiveCustomers` INTEGER NULL,
  `mappedCustomers` INTEGER NULL,
  `unmappedCustomers` INTEGER NULL,
  `routerMapping` JSON NULL,
  `errors` JSON NULL,
  `syncedAt` BIGINT NULL,
  `syncedBy` VARCHAR(191) NULL,
  `lastSyncAt` BIGINT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAtDb` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SplynxBtsActiveStat` (
  `btsName` VARCHAR(191) NOT NULL,
  `region` VARCHAR(191) NULL,
  `activeCustomers` INTEGER NULL,
  `totalCustomers` INTEGER NULL,
  `customersByTariff` JSON NULL,
  `lastSynced` BIGINT NULL,
  `syncedAt` BIGINT NULL,
  `lastSyncAt` BIGINT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAtDb` DATETIME(3) NOT NULL,

  PRIMARY KEY (`btsName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SplynxBtsActiveStat_activeCustomers_idx` ON `SplynxBtsActiveStat`(`activeCustomers`);

CREATE TABLE `SalesAuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `collection` VARCHAR(191) NOT NULL,
  `recordId` VARCHAR(191) NULL,
  `userId` VARCHAR(191) NULL,
  `userEmail` VARCHAR(191) NULL,
  `changes` JSON NULL,
  `previousState` JSON NULL,
  `metadata` JSON NULL,
  `timestamp` BIGINT NOT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAtDb` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SalesAuditLog_collection_idx` ON `SalesAuditLog`(`collection`);
CREATE INDEX `SalesAuditLog_timestamp_idx` ON `SalesAuditLog`(`timestamp`);
CREATE INDEX `SalesAuditLog_recordId_idx` ON `SalesAuditLog`(`recordId`);

CREATE TABLE `SplynxNonce` (
  `key` VARCHAR(191) NOT NULL,
  `nonce` INTEGER NOT NULL,
  `updatedAt` BIGINT NULL,
  `lastSyncAt` BIGINT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAtDb` DATETIME(3) NOT NULL,

  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;