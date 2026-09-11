-- Add blockedSince to Customer for the win-back 90-day gate (inactive/blocked 90d+)
ALTER TABLE `Customer` ADD COLUMN `blockedSince` BIGINT NULL;
