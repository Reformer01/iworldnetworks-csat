-- Paystack -> Splynx golden join key: raw.metadata.customer_id from the
-- portal.iwn.ng splynx_paystack_addon payment flow.
ALTER TABLE `PaystackTransaction`
    ADD COLUMN `splynxCustomerId` VARCHAR(191) NULL;

CREATE INDEX `PaystackTransaction_splynxCustomerId_idx` ON `PaystackTransaction`(`splynxCustomerId`);
