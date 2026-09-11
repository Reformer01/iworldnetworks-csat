-- CreateTable
CREATE TABLE `Feedback` (
    `id` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NULL,
    `customerEmail` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `servicePlan` VARCHAR(191) NULL,
    `comment` VARCHAR(191) NULL,
    `staffName` VARCHAR(191) NULL,
    `ratings` JSON NULL,
    `referralSource` VARCHAR(191) NULL,
    `spotlightInterview` VARCHAR(191) NULL,
    `serviceDate` VARCHAR(191) NULL,
    `serviceTime` VARCHAR(191) NULL,
    `submissionDate` VARCHAR(191) NULL,
    `timestamp` BIGINT NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'new',
    `resolutionNotes` VARCHAR(191) NULL,
    `aiAnalysis` JSON NULL,
    `satisfied` VARCHAR(191) NULL,
    `source` VARCHAR(191) NULL,
    `updatedAt` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAtDb` DATETIME(3) NOT NULL,

    INDEX `Feedback_category_idx`(`category`),
    INDEX `Feedback_timestamp_idx`(`timestamp`),
    INDEX `Feedback_location_idx`(`location`),
    INDEX `Feedback_status_idx`(`status`),
    INDEX `Feedback_customerEmail_idx`(`customerEmail`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeedbackToken` (
    `id` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerEmail` VARCHAR(191) NOT NULL,
    `servicePlan` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `serviceDate` VARCHAR(191) NOT NULL,
    `sourceEvent` VARCHAR(191) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` BIGINT NOT NULL,
    `expiresAt` BIGINT NOT NULL,
    `openedAt` BIGINT NULL,
    `submittedAt` BIGINT NULL,
    `eventHash` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL DEFAULT 'Reliability',
    `staffName` VARCHAR(191) NULL,

    UNIQUE INDEX `FeedbackToken_eventHash_key`(`eventHash`),
    INDEX `FeedbackToken_customerEmail_idx`(`customerEmail`),
    INDEX `FeedbackToken_used_idx`(`used`),
    INDEX `FeedbackToken_expiresAt_idx`(`expiresAt`),
    INDEX `FeedbackToken_eventHash_idx`(`eventHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `billingEmail` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `login` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `street` VARCHAR(191) NULL,
    `status` VARCHAR(191) NULL,
    `lifecycle` VARCHAR(191) NULL,
    `online` BOOLEAN NULL,
    `lastOnlineAt` BIGINT NULL,
    `lastUpdateAt` BIGINT NULL,
    `mrrTotal` DOUBLE NULL,
    `accountType` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `servicePlan` VARCHAR(191) NULL,
    `firstSyncedAt` BIGINT NULL,
    `lastSyncAt` BIGINT NULL,
    `lastChangeAt` BIGINT NULL,
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `reminder15SentAt` BIGINT NULL,
    `reminder30SentAt` BIGINT NULL,
    `churnSurveySentAt` BIGINT NULL,
    `churnSurveyToken` VARCHAR(191) NULL,
    `winBackSentAt` BIGINT NULL,
    `winBackToken` VARCHAR(191) NULL,
    `churnedAt` BIGINT NULL,
    `inactiveSince` BIGINT NULL,
    `emailOptOut` BOOLEAN NOT NULL DEFAULT false,
    `emailInvalid` BOOLEAN NOT NULL DEFAULT false,
    `overdueInfo` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Customer_customerId_key`(`customerId`),
    INDEX `Customer_lifecycle_idx`(`lifecycle`),
    INDEX `Customer_city_idx`(`city`),
    INDEX `Customer_status_idx`(`status`),
    INDEX `Customer_customerId_idx`(`customerId`),
    INDEX `Customer_deleted_idx`(`deleted`),
    INDEX `Customer_lastSyncAt_idx`(`lastSyncAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `total` DOUBLE NOT NULL DEFAULT 0,
    `dueDate` BIGINT NULL,
    `date` BIGINT NULL,
    `status` VARCHAR(191) NULL,
    `isPaid` BOOLEAN NOT NULL DEFAULT false,
    `paidAt` BIGINT NULL,
    `reminder15SentAt` BIGINT NULL,
    `reminder30SentAt` BIGINT NULL,
    `syncedAt` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invoice_invoiceId_key`(`invoiceId`),
    INDEX `Invoice_customerId_idx`(`customerId`),
    INDEX `Invoice_invoiceId_idx`(`invoiceId`),
    INDEX `Invoice_isPaid_idx`(`isPaid`),
    INDEX `Invoice_dueDate_idx`(`dueDate`),
    INDEX `Invoice_syncedAt_idx`(`syncedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BtsAuditRecord` (
    `id` VARCHAR(191) NOT NULL,
    `auditPeriod` VARCHAR(191) NOT NULL,
    `btsName` VARCHAR(191) NOT NULL,
    `region` VARCHAR(191) NULL,
    `status` VARCHAR(191) NULL,
    `customerCount` INTEGER NULL,
    `monthlyRevenue` DOUBLE NULL,
    `targetPaymentRate` DOUBLE NULL,
    `enterpriseCount` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BtsAuditRecord_auditPeriod_status_btsName_idx`(`auditPeriod`, `status`, `btsName`),
    INDEX `BtsAuditRecord_auditPeriod_region_btsName_idx`(`auditPeriod`, `region`, `btsName`),
    UNIQUE INDEX `BtsAuditRecord_auditPeriod_btsName_key`(`auditPeriod`, `btsName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesRecord` (
    `id` VARCHAR(191) NOT NULL,
    `region` VARCHAR(191) NOT NULL,
    `product` VARCHAR(191) NOT NULL,
    `mrr` DOUBLE NOT NULL,
    `nrr` DOUBLE NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SalesRecord_region_idx`(`region`),
    INDEX `SalesRecord_month_year_idx`(`month`, `year`),
    UNIQUE INDEX `SalesRecord_region_product_month_year_key`(`region`, `product`, `month`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReadBudget` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'singleton',
    `date` DATE NOT NULL,
    `used` INTEGER NOT NULL DEFAULT 0,
    `limit` INTEGER NOT NULL DEFAULT 50000,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'editor',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    INDEX `AdminUser_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncLock` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'splynx-hourly-sync',
    `leaseUntil` BIGINT NOT NULL,
    `lastRunAt` BIGINT NULL,
    `lastStatus` VARCHAR(191) NULL,
    `lastError` VARCHAR(191) NULL,
    `lastStats` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChurnSurvey` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `customerEmail` VARCHAR(191) NOT NULL,
    `sentAt` BIGINT NOT NULL,
    `expiresAt` BIGINT NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `submittedAt` BIGINT NULL,
    `rating` INTEGER NULL,
    `reason` VARCHAR(191) NULL,
    `comment` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChurnSurvey_customerId_idx`(`customerId`),
    INDEX `ChurnSurvey_used_idx`(`used`),
    INDEX `ChurnSurvey_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WinBackToken` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `sentAt` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WinBackToken_token_key`(`token`),
    INDEX `WinBackToken_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeedbackReminderToken` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `sentAt` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FeedbackReminderToken_token_key`(`token`),
    INDEX `FeedbackReminderToken_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Journal` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `error` VARCHAR(191) NULL,
    `result` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Journal_type_idx`(`type`),
    INDEX `Journal_status_idx`(`status`),
    INDEX `Journal_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SplynxMeta` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'sync',
    `invoicesApiDenied` BOOLEAN NOT NULL DEFAULT false,
    `deniedAt` BIGINT NULL,
    `lastInvoiceSyncAt` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

