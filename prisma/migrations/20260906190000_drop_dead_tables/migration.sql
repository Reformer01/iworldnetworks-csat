-- Drop tables with zero readers and zero writers (Sep 2026 audit).
-- BtsCustomer/BtsCustomerSite/BtsAdminAuditRecord/BtsAuditRecord/SplynxBtsSyncMeta/
-- SplynxBtsActiveStat: orphaned legacy BTS-sync subsystem (route + lib removed).
-- WinBackToken/FeedbackReminderToken/ReadBudget: writer modules removed (no callers).
DROP TABLE IF EXISTS `BtsCustomer`;
DROP TABLE IF EXISTS `BtsCustomerSite`;
DROP TABLE IF EXISTS `BtsAdminAuditRecord`;
DROP TABLE IF EXISTS `BtsAuditRecord`;
DROP TABLE IF EXISTS `SplynxBtsSyncMeta`;
DROP TABLE IF EXISTS `SplynxBtsActiveStat`;
DROP TABLE IF EXISTS `WinBackToken`;
DROP TABLE IF EXISTS `FeedbackReminderToken`;
DROP TABLE IF EXISTS `ReadBudget`;
