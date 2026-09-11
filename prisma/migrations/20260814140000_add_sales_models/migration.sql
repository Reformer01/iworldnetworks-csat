-- CreateTable
CREATE TABLE `SalesRecordEntry` (
    `id` VARCHAR(191) NOT NULL,
    `serialNumber` INTEGER NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `region` VARCHAR(191) NOT NULL,
    `segment` VARCHAR(191) NOT NULL,
    `nrc` DOUBLE NOT NULL DEFAULT 0,
    `mrc` DOUBLE NOT NULL DEFAULT 0,
    `planCode` VARCHAR(191) NOT NULL,
    `saleDate` VARCHAR(191) NOT NULL DEFAULT '',
    `quarter` VARCHAR(191) NOT NULL,
    `month` VARCHAR(191) NOT NULL DEFAULT '',
    `packageType` VARCHAR(191) NOT NULL DEFAULT 'Outright',
    `salesAgent` VARCHAR(191) NOT NULL DEFAULT '',
    `meansOfSale` VARCHAR(191) NOT NULL DEFAULT '',
    `accountStatus` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `statusNotes` VARCHAR(191) NOT NULL DEFAULT '',
    `importBatchId` VARCHAR(191) NOT NULL DEFAULT '',
    `customerType` VARCHAR(191) NOT NULL DEFAULT 'new',
    `revivedByAgent` VARCHAR(191) NOT NULL DEFAULT '',
    `bts` VARCHAR(191) NOT NULL DEFAULT '',
    `deletedAt` BIGINT NULL,
    `createdAt` BIGINT NOT NULL DEFAULT 0,
    `updatedAt` BIGINT NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `SalesRecordEntry_region_accountStatus_idx` ON `SalesRecordEntry`(`region`, `accountStatus`);

-- CreateIndex
CREATE INDEX `SalesRecordEntry_salesAgent_idx` ON `SalesRecordEntry`(`salesAgent`);

-- CreateIndex
CREATE INDEX `SalesRecordEntry_importBatchId_idx` ON `SalesRecordEntry`(`importBatchId`);

-- CreateIndex
CREATE INDEX `SalesRecordEntry_serialNumber_idx` ON `SalesRecordEntry`(`serialNumber`);

-- CreateIndex
CREATE INDEX `SalesRecordEntry_month_idx` ON `SalesRecordEntry`(`month`);

-- CreateTable
CREATE TABLE `SalesTarget` (
    `id` VARCHAR(191) NOT NULL,
    `month` VARCHAR(191) NOT NULL,
    `region` VARCHAR(191) NULL,
    `agentName` VARCHAR(191) NULL,
    `targetRevenue` DOUBLE NOT NULL,
    `targetCustomers` INTEGER NOT NULL,
    `createdAt` BIGINT NOT NULL DEFAULT 0,
    `updatedAt` BIGINT NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `SalesTarget_month_idx` ON `SalesTarget`(`month`);

-- CreateTable
CREATE TABLE `SalesImport` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'csv_upload',
    `fileName` VARCHAR(191) NOT NULL DEFAULT '',
    `recordCount` INTEGER NOT NULL DEFAULT 0,
    `importedAt` BIGINT NOT NULL DEFAULT 0,
    `importedBy` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'completed',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `SalesImport_batchId_key` ON `SalesImport`(`batchId`);
