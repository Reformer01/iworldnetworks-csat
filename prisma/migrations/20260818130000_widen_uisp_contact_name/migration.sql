-- UISP contact names exceed VARCHAR(191) (e.g. full company names).
ALTER TABLE `UispSite` MODIFY `contactName` TEXT NULL;