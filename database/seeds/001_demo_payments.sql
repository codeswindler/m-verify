USE m_verify;

INSERT INTO payments (tenant_id, phone_number, customer_name, reference, transaction_code, amount, payment_channel, status, payment_time)
VALUES
  (1, '254712345678', 'Amina Otieno', 'TABLE-04', 'RBA123ABC1', 1200.00, 'MPESA_C2B', 'PAID', NOW() - INTERVAL 20 MINUTE),
  (1, '254723456789', 'Brian Mwangi', 'ORDER-102', 'RBA123ABC2', 850.00, 'MPESA_C2B', 'PAID', NOW() - INTERVAL 8 MINUTE),
  (1, '254734567890', 'Grace Njeri', 'VIP-07', 'RBA123ABC3', 500.00, 'MPESA_C2B', 'PAID', NOW() - INTERVAL 1 HOUR)
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  customer_name = VALUES(customer_name),
  reference = VALUES(reference),
  amount = VALUES(amount),
  status = VALUES(status),
  payment_time = VALUES(payment_time);
