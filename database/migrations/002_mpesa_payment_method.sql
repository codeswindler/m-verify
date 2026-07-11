ALTER TABLE tenant_mpesa_credentials
  ADD COLUMN payment_method ENUM('paybill', 'till') NOT NULL DEFAULT 'paybill' AFTER environment;
