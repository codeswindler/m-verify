SET @add_mpesa_payment_method = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE tenant_mpesa_credentials ADD COLUMN payment_method ENUM(''paybill'', ''till'') NOT NULL DEFAULT ''paybill'' AFTER environment',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tenant_mpesa_credentials'
    AND COLUMN_NAME = 'payment_method'
);
PREPARE add_mpesa_payment_method_stmt FROM @add_mpesa_payment_method;
EXECUTE add_mpesa_payment_method_stmt;
DEALLOCATE PREPARE add_mpesa_payment_method_stmt;
