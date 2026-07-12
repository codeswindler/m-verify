UPDATE payments
SET payment_time = DATE_SUB(payment_time, INTERVAL 3 HOUR)
WHERE payment_channel = 'MPESA_C2B'
  AND JSON_UNQUOTE(JSON_EXTRACT(raw_receipt_json, '$.TransTime')) REGEXP '^[0-9]{14}$'
  AND payment_time = STR_TO_DATE(
    JSON_UNQUOTE(JSON_EXTRACT(raw_receipt_json, '$.TransTime')),
    '%Y%m%d%H%i%s'
  );

UPDATE payments AS payment
JOIN JSON_TABLE(
  payment.raw_receipt_json,
  '$.Body.stkCallback.CallbackMetadata.Item[*]'
  COLUMNS (
    metadata_name VARCHAR(64) PATH '$.Name',
    metadata_value VARCHAR(64) PATH '$.Value'
  )
) AS metadata ON metadata.metadata_name = 'TransactionDate'
SET payment.payment_time = DATE_SUB(payment.payment_time, INTERVAL 3 HOUR)
WHERE payment.payment_channel = 'MPESA_STK'
  AND metadata.metadata_value REGEXP '^[0-9]{14}$'
  AND payment.payment_time = STR_TO_DATE(metadata.metadata_value, '%Y%m%d%H%i%s');
