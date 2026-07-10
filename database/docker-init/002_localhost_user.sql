CREATE USER IF NOT EXISTS 'm_verify'@'localhost' IDENTIFIED BY 'm_verify_password';
CREATE USER IF NOT EXISTS 'm_verify'@'127.0.0.1' IDENTIFIED BY 'm_verify_password';
ALTER USER 'm_verify'@'localhost' IDENTIFIED BY 'm_verify_password';
ALTER USER 'm_verify'@'127.0.0.1' IDENTIFIED BY 'm_verify_password';
GRANT ALL PRIVILEGES ON `m_verify`.* TO 'm_verify'@'localhost';
GRANT ALL PRIVILEGES ON `m_verify`.* TO 'm_verify'@'127.0.0.1';
FLUSH PRIVILEGES;
