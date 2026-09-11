ALTER TABLE `UispSite` ADD COLUMN `region` VARCHAR(191) NULL;

CREATE INDEX `UispSite_region_idx` ON `UispSite`(`region`);