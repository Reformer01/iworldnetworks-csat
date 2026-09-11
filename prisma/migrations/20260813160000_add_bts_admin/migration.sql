-- BTS admin module -> MariaDB (bts_customers, bts_customer_sites,
-- BtsAdminAuditRecord). Firestore throttling (RESOURCE_EXHAUSTED) caused
-- intermittent 500s on the admin BTS pages; the module now reads/writes
-- MariaDB (BTS_DB=1) with best-effort Firestore mirrors for rollback.
-- bts_latest_audit is a derived snapshot, not stored on the DB path.

CREATE TABLE `BtsCustomer` (
  `id` VARCHAR(191) NOT NULL,
  `serialNumber` INTEGER NULL,
  `customerName` VARCHAR(191) NULL,
  `btsName` VARCHAR(191) NULL,
  `status` VARCHAR(191) NULL,
  `accountType` VARCHAR(191) NULL,
  `mrc` INTEGER NULL,
  `planCode` VARCHAR(191) NULL,
  `region` VARCHAR(191) NULL,
  `importBatchId` VARCHAR(191) NULL,
  `editedBy` VARCHAR(191) NULL,
  `createdAt` BIGINT NULL,
  `updatedAt` BIGINT NULL,
  `deletedAt` BIGINT NULL,
  `lastSyncAt` BIGINT NOT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAtDb` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `BtsCustomer_importBatchId_idx` ON `BtsCustomer`(`importBatchId`);
CREATE INDEX `BtsCustomer_region_idx` ON `BtsCustomer`(`region`);
CREATE INDEX `BtsCustomer_btsName_idx` ON `BtsCustomer`(`btsName`);

CREATE TABLE `BtsCustomerSite` (
  `id` VARCHAR(191) NOT NULL,
  `btsName` VARCHAR(191) NULL,
  `matchedBtsName` VARCHAR(191) NULL,
  `matchStatus` VARCHAR(191) NULL,
  `region` VARCHAR(191) NULL,
  `totalCustomers` INTEGER NULL,
  `activeCustomers` INTEGER NULL,
  `enterpriseCustomers` INTEGER NULL,
  `retailCustomers` INTEGER NULL,
  `smeCustomers` INTEGER NULL,
  `residentialCustomers` INTEGER NULL,
  `partnersHosts` INTEGER NULL,
  `neighbourhoodCustomers` INTEGER NULL,
  `totalMrr` INTEGER NULL,
  `importBatchId` VARCHAR(191) NULL,
  `createdAt` BIGINT NULL,
  `lastSyncAt` BIGINT NOT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAtDb` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `BtsCustomerSite_importBatchId_idx` ON `BtsCustomerSite`(`importBatchId`);
CREATE INDEX `BtsCustomerSite_region_idx` ON `BtsCustomerSite`(`region`);

CREATE TABLE `BtsAdminAuditRecord` (
  `id` VARCHAR(191) NOT NULL,
  `btsName` VARCHAR(191) NOT NULL,
  `btsId` INTEGER NULL,
  `region` VARCHAR(191) NOT NULL,
  `siteType` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `latitude` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `address` VARCHAR(500) NULL,
  `host` VARCHAR(191) NULL,
  `activeCustomers` INTEGER NULL,
  `totalCustomers` INTEGER NULL,
  `enterpriseCustomers` INTEGER NULL,
  `retailCustomers` INTEGER NULL,
  `monthlyRecurringRevenue` INTEGER NULL,
  `targetMrr` INTEGER NULL,
  `attainmentPercentage` DOUBLE NULL,
  `nrcRevenue` INTEGER NULL,
  `totalRevenue` INTEGER NULL,
  `splynxRouterIds` JSON NULL,
  `splynxRouterNames` JSON NULL,
  `lastSplynxSync` BIGINT NULL,
  `lastOutageDate` BIGINT NULL,
  `outageCountThisMonth` INTEGER NULL,
  `maintenanceNotes` VARCHAR(191) NULL,
  `auditedBy` VARCHAR(191) NULL,
  `auditedAt` BIGINT NULL,
  `auditPeriod` VARCHAR(191) NULL,
  `createdAt` BIGINT NULL,
  `updatedAt` BIGINT NULL,
  `deletedAt` BIGINT NULL,
  `lastSyncAt` BIGINT NOT NULL,
  `createdAtDb` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAtDb` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `BtsAdminAuditRecord_btsName_idx` ON `BtsAdminAuditRecord`(`btsName`);
CREATE INDEX `BtsAdminAuditRecord_region_idx` ON `BtsAdminAuditRecord`(`region`);
CREATE INDEX `BtsAdminAuditRecord_auditPeriod_idx` ON `BtsAdminAuditRecord`(`auditPeriod`);
CREATE INDEX `BtsAdminAuditRecord_status_idx` ON `BtsAdminAuditRecord`(`status`);
