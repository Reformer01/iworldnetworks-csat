-- UISP BTS attribution: nearest type=site ancestor per node.
-- Endpoints get their tower (leaf BTS site); site nodes map to themselves.
-- Root customer locations (endpoint without a site ancestor) stay NULL and
-- fall back to the static BTS list.

ALTER TABLE `UispSite` ADD COLUMN `btsId` VARCHAR(191) NULL, ADD COLUMN `btsName` VARCHAR(191) NULL;

CREATE INDEX `UispSite_btsId_idx` ON `UispSite`(`btsId`);
