SET @add_user_module_permissions = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN module_permissions JSON NULL AFTER role',
    'SELECT 1'
  )
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'module_permissions'
);
PREPARE add_user_module_permissions_stmt FROM @add_user_module_permissions;
EXECUTE add_user_module_permissions_stmt;
DEALLOCATE PREPARE add_user_module_permissions_stmt;
