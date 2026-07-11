SET @drop_callback_secret_hash = (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE tenant_mpesa_credentials DROP COLUMN callback_secret_hash',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tenant_mpesa_credentials'
    AND COLUMN_NAME = 'callback_secret_hash'
);
PREPARE drop_callback_secret_hash_stmt FROM @drop_callback_secret_hash;
EXECUTE drop_callback_secret_hash_stmt;
DEALLOCATE PREPARE drop_callback_secret_hash_stmt;

SET @drop_callback_secret_hint = (
  SELECT IF(
    COUNT(*) > 0,
    'ALTER TABLE tenant_mpesa_credentials DROP COLUMN callback_secret_hint',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tenant_mpesa_credentials'
    AND COLUMN_NAME = 'callback_secret_hint'
);
PREPARE drop_callback_secret_hint_stmt FROM @drop_callback_secret_hint;
EXECUTE drop_callback_secret_hint_stmt;
DEALLOCATE PREPARE drop_callback_secret_hint_stmt;
