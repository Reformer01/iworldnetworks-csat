-- Unique natural keys for reconciliation tables.
-- Dedupe first (keep the oldest row per natural key), then add the unique index.

DELETE l FROM `PaystackReconciliationLink` l
JOIN `PaystackReconciliationLink` k
  ON k.`paystackReference` = l.`paystackReference`
 AND (k.`createdAt` < l.`createdAt` OR (k.`createdAt` = l.`createdAt` AND k.`id` < l.`id`));

ALTER TABLE `PaystackReconciliationLink`
  ADD UNIQUE INDEX `PaystackReconciliationLink_paystackReference_key` (`paystackReference`);

DELETE e FROM `ReconciliationException` e
JOIN `ReconciliationException` k
  ON k.`kind` = e.`kind`
 AND k.`paystackReference` <=> e.`paystackReference`
 AND k.`splynxLedgerId` <=> e.`splynxLedgerId`
 AND (k.`createdAt` < e.`createdAt` OR (k.`createdAt` = e.`createdAt` AND k.`id` < e.`id`));

ALTER TABLE `ReconciliationException`
  ADD UNIQUE INDEX `ReconciliationException_kind_paystackReference_splynxLedgerId_key` (`kind`, `paystackReference`, `splynxLedgerId`);

DELETE l FROM `SplynxIncomeLedger` l
JOIN `SplynxIncomeLedger` k
  ON k.`source` = l.`source`
 AND k.`sourceId` <=> l.`sourceId`
 AND (k.`createdAt` < l.`createdAt` OR (k.`createdAt` = l.`createdAt` AND k.`id` < l.`id`));

ALTER TABLE `SplynxIncomeLedger`
  ADD UNIQUE INDEX `SplynxIncomeLedger_source_sourceId_key` (`source`, `sourceId`);