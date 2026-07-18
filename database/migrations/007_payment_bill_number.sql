-- Adds a staff-entered bill number captured at verification time.
-- Nullable so existing verified payments and unverified rows are unaffected.
-- Unique per business (tenant). MySQL treats NULLs as distinct, so multiple
-- unverified/legacy rows with NULL bill_number remain valid.
ALTER TABLE payments
  ADD COLUMN bill_number VARCHAR(60) NULL AFTER reference;

ALTER TABLE payments
  ADD UNIQUE KEY uq_payments_tenant_bill (tenant_id, bill_number);
