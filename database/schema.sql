CREATE DATABASE IF NOT EXISTS m_verify CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE m_verify;

CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  commission_rate_pct DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
  contact_email VARCHAR(160) NULL,
  contact_phone VARCHAR(40) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_slug (slug),
  KEY idx_tenants_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tenants (id, name, slug, status)
VALUES (1, 'Default Business', 'default-business', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status);

CREATE TABLE IF NOT EXISTS tenant_mpesa_credentials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  environment ENUM('sandbox', 'production') NOT NULL DEFAULT 'production',
  payment_method ENUM('paybill', 'till') NOT NULL DEFAULT 'paybill',
  business_shortcode VARCHAR(30) NOT NULL,
  till_number VARCHAR(30) NULL,
  consumer_key_encrypted TEXT NULL,
  consumer_secret_encrypted TEXT NULL,
  passkey_encrypted TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_mpesa_tenant (tenant_id),
  UNIQUE KEY uq_tenant_mpesa_shortcode (business_shortcode),
  KEY idx_tenant_mpesa_active (active),
  CONSTRAINT fk_tenant_mpesa_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL DEFAULT 1,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role ENUM('admin', 'manager', 'waiter') NOT NULL DEFAULT 'waiter',
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role_disabled (role, disabled),
  KEY idx_users_tenant (tenant_id),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL DEFAULT 1,
  phone_number VARCHAR(120) NOT NULL,
  customer_name VARCHAR(160) NULL,
  reference VARCHAR(120) NULL,
  transaction_code VARCHAR(40) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  payment_channel VARCHAR(40) NOT NULL DEFAULT 'MPESA_C2B',
  status ENUM('PAID') NOT NULL DEFAULT 'PAID',
  payment_time DATETIME NULL,
  verified_status BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by BIGINT UNSIGNED NULL,
  verified_at DATETIME NULL,
  raw_receipt_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_transaction_code (transaction_code),
  KEY idx_payments_tenant (tenant_id),
  KEY idx_payments_tenant_reference (tenant_id, reference),
  KEY idx_payments_phone_transaction (phone_number, transaction_code),
  KEY idx_payments_status_verified (status, verified_status),
  KEY idx_payments_payment_time (payment_time),
  CONSTRAINT fk_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS device_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  device_id VARCHAR(120) NOT NULL,
  device_name VARCHAR(120) NULL,
  refresh_token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_device_sessions_refresh_hash (refresh_token_hash),
  KEY idx_device_sessions_user_device (user_id, device_id),
  KEY idx_device_sessions_active (user_id, revoked_at, expires_at),
  CONSTRAINT fk_device_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS verification_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NULL,
  payment_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  device_session_id BIGINT UNSIGNED NULL,
  submitted_phone_number VARCHAR(120) NOT NULL,
  submitted_transaction_code VARCHAR(40) NOT NULL,
  submitted_amount DECIMAL(12, 2) NULL,
  submitted_reference VARCHAR(120) NULL,
  result ENUM('VERIFIED', 'NOT_FOUND', 'AMOUNT_MISMATCH', 'ALREADY_VERIFIED', 'ERROR') NOT NULL,
  ip_address VARCHAR(80) NULL,
  user_agent VARCHAR(255) NULL,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_created_at (created_at),
  KEY idx_logs_result (result),
  KEY idx_logs_tenant (tenant_id),
  KEY idx_logs_user (user_id),
  KEY idx_logs_payment (payment_id),
  CONSTRAINT fk_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  CONSTRAINT fk_logs_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_logs_session FOREIGN KEY (device_session_id) REFERENCES device_sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
