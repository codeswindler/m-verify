import type { PaymentSummary, StkPromptResponse, StkPromptStatus } from "@m-verify/shared";
import { config } from "../config.js";
import { pool, withTransaction, type ResultSetHeader, type RowDataPacket } from "../db.js";
import { AppError } from "../http.js";
import type { AuthContext } from "../types.js";
import { maskPhoneNumber, normalizePhoneNumber, parseDarajaTime, toSafeUser } from "../utils/format.js";
import { decryptCredential } from "../utils/security.js";

type MpesaCredentialRow = RowDataPacket & {
  tenant_id: number;
  tenant_slug: string;
  environment: "sandbox" | "production";
  payment_method: "paybill" | "till";
  business_shortcode: string;
  till_number: string | null;
  consumer_key_encrypted: string | null;
  consumer_secret_encrypted: string | null;
  passkey_encrypted: string | null;
  active: number;
};

type StkRequestRow = RowDataPacket & {
  id: number;
  tenant_id: number;
  phone_number: string;
  amount: string;
  reference: string | null;
  checkout_request_id: string | null;
  status: StkPromptStatus;
  result_description: string | null;
  payment_id: number | null;
  expires_at: Date | string;
};

type PaymentRow = RowDataPacket & {
  id: number;
  tenant_id: number | null;
  tenant_name: string | null;
  customer_name: string | null;
  reference: string | null;
  phone_number: string;
  transaction_code: string;
  amount: string;
  payment_channel: string;
  status: "PAID";
  payment_time: Date | string | null;
  verified_status: number;
  verified_at: Date | string | null;
  verified_by_id: number | null;
  verified_by_username: string | null;
  verified_by_full_name: string | null;
  verified_by_role: string | null;
};

type DarajaJson = Record<string, unknown> & {
  access_token?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  CustomerMessage?: string;
  ResultCode?: string | number;
  ResultDesc?: string;
  errorMessage?: string;
  errorCode?: string;
};

type StkCallbackBody = {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: {
        Item?: Array<{ Name: string; Value?: string | number }>;
      };
    };
  };
};

const paymentSelect = `SELECT
  p.id, p.tenant_id, t.name AS tenant_name,
  p.customer_name, p.reference, p.phone_number, p.transaction_code, p.amount, p.payment_channel, p.status, p.payment_time,
  p.verified_status, p.verified_at,
  u.id AS verified_by_id, u.username AS verified_by_username, u.full_name AS verified_by_full_name, u.role AS verified_by_role
FROM payments p
LEFT JOIN tenants t ON t.id = p.tenant_id
LEFT JOIN users u ON u.id = p.verified_by`;

function paymentToSummary(payment: PaymentRow): PaymentSummary {
  return {
    id: Number(payment.id),
    tenantId: payment.tenant_id ? Number(payment.tenant_id) : null,
    tenantName: payment.tenant_name,
    customerName: payment.customer_name,
    reference: payment.reference,
    phoneNumber: maskPhoneNumber(payment.phone_number),
    transactionCode: payment.transaction_code,
    amount: String(payment.amount),
    paymentChannel: payment.payment_channel,
    status: payment.status,
    paymentTime: payment.payment_time ? new Date(payment.payment_time).toISOString() : null,
    verifiedStatus: Boolean(payment.verified_status),
    verifiedBy: payment.verified_by_id
      ? toSafeUser({
          id: payment.verified_by_id,
          username: payment.verified_by_username,
          full_name: payment.verified_by_full_name,
          role: payment.verified_by_role,
          disabled: false
        } as RowDataPacket & Record<string, unknown>)
      : null,
    verifiedAt: payment.verified_at ? new Date(payment.verified_at).toISOString() : null
  };
}

function darajaOAuthUrl(environment: "sandbox" | "production"): string {
  return environment === "sandbox" ? config.daraja.oauthSandboxUrl : config.daraja.oauthProductionUrl;
}

function stkPushUrl(environment: "sandbox" | "production"): string {
  return environment === "sandbox" ? config.daraja.stkPushSandboxUrl : config.daraja.stkPushProductionUrl;
}

function stkQueryUrl(environment: "sandbox" | "production"): string {
  return environment === "sandbox" ? config.daraja.stkQuerySandboxUrl : config.daraja.stkQueryProductionUrl;
}

function timestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}${value("month")}${value("day")}${value("hour")}${value("minute")}${value("second")}`;
}

const deferredProviderTimeoutCodes = new Set(["1037"]);

async function readDarajaJson(response: Response): Promise<DarajaJson> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as DarajaJson;
  } catch {
    return { errorMessage: text };
  }
}

async function tenantCredentials(tenantId: number): Promise<MpesaCredentialRow> {
  const [rows] = await pool.execute<MpesaCredentialRow[]>(
    `SELECT mc.tenant_id, t.slug AS tenant_slug, mc.environment, mc.payment_method, mc.business_shortcode, mc.till_number,
      mc.consumer_key_encrypted, mc.consumer_secret_encrypted, mc.passkey_encrypted, mc.active
     FROM tenant_mpesa_credentials mc
     INNER JOIN tenants t ON t.id = mc.tenant_id
     WHERE mc.tenant_id = ?
     LIMIT 1`,
    [tenantId]
  );
  const row = rows[0];
  if (!row || !row.active) {
    throw new AppError(400, "M-Pesa credentials are not active for this business.", "MPESA_NOT_CONFIGURED");
  }
  return row;
}

async function requestAccessToken(credentials: MpesaCredentialRow): Promise<string> {
  const consumerKey = decryptCredential(credentials.consumer_key_encrypted);
  const consumerSecret = decryptCredential(credentials.consumer_secret_encrypted);
  if (!consumerKey || !consumerSecret) {
    throw new AppError(400, "Save Daraja consumer key and secret before using STK prompt.", "DARAJA_CREDENTIALS_REQUIRED");
  }

  const response = await fetch(darajaOAuthUrl(credentials.environment), {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`, "utf8").toString("base64")}`
    }
  });
  const payload = await readDarajaJson(response);
  if (!response.ok || !payload.access_token) {
    throw new AppError(502, String(payload.errorMessage ?? payload.error ?? "Daraja token request failed."), "DARAJA_TOKEN_FAILED", payload);
  }
  return String(payload.access_token);
}

function callbackUrl(slug: string): string {
  return `${config.publicApiBaseUrl.replace(/\/+$/, "")}/callbacks/${slug}/stk/result`;
}

function stkPassword(shortCode: string, passkey: string, time: string): string {
  return Buffer.from(`${shortCode}${passkey}${time}`, "utf8").toString("base64");
}

async function loadPayment(paymentId: number | null): Promise<PaymentSummary | undefined> {
  if (!paymentId) return undefined;
  const [rows] = await pool.execute<PaymentRow[]>(`${paymentSelect} WHERE p.id = ? LIMIT 1`, [paymentId]);
  return rows[0] ? paymentToSummary(rows[0]) : undefined;
}

async function loadPrompt(id: number, auth?: AuthContext): Promise<StkRequestRow> {
  const params: Array<string | number> = [id];
  let tenantFilter = "";
  if (auth?.user.role !== "admin") {
    tenantFilter = " AND tenant_id = ?";
    params.push(Number(auth?.user.tenantId ?? 0));
  }
  const [rows] = await pool.execute<StkRequestRow[]>(
    `SELECT id, tenant_id, phone_number, amount, reference, checkout_request_id, status, result_description, payment_id, expires_at
     FROM stk_prompt_requests
     WHERE id = ?${tenantFilter}
     LIMIT 1`,
    params
  );
  const row = rows[0];
  if (!row) throw new AppError(404, "STK prompt was not found.", "STK_NOT_FOUND");
  return row;
}

function responseFromPrompt(row: StkRequestRow, payment?: PaymentSummary): StkPromptResponse {
  return {
    id: Number(row.id),
    status: row.status,
    checkoutRequestId: row.checkout_request_id,
    payment,
    failureReason: row.result_description,
    message:
      row.status === "PAID"
        ? "Payment received. Verify this payment?"
        : row.status === "PENDING" || row.status === "REQUESTED"
          ? "Waiting for customer to complete M-Pesa prompt."
          : row.result_description ?? "STK prompt did not complete."
  };
}

export async function initiateStkPrompt(input: { phoneNumber: string; amount: number; reference?: string }, auth: AuthContext): Promise<StkPromptResponse> {
  const tenantId = auth.user.tenantId;
  if (!tenantId) throw new AppError(400, "Business account is required for STK prompt.", "TENANT_REQUIRED");

  const credentials = await tenantCredentials(tenantId);
  const passkey = decryptCredential(credentials.passkey_encrypted);
  if (!passkey) throw new AppError(400, "Save Daraja passkey before using STK prompt.", "DARAJA_PASSKEY_REQUIRED");

  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 1) throw new AppError(400, "Amount must round to at least KES 1.", "INVALID_AMOUNT");

  const reference = input.reference?.trim() || `MVERIFY-${Date.now()}`;
  const token = await requestAccessToken(credentials);
  const time = timestamp();
  const transactionType = credentials.payment_method === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline";

  const [insert] = await pool.execute<ResultSetHeader>(
    `INSERT INTO stk_prompt_requests (tenant_id, user_id, device_session_id, phone_number, amount, reference, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'REQUESTED', DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${config.daraja.stkPromptTimeoutMinutes} MINUTE))`,
    [tenantId, auth.user.id, auth.sessionId, phoneNumber, amount, reference]
  );

  const payload = {
    BusinessShortCode: credentials.business_shortcode,
    Password: stkPassword(credentials.business_shortcode, passkey, time),
    Timestamp: time,
    TransactionType: transactionType,
    Amount: amount,
    PartyA: phoneNumber,
    PartyB: credentials.payment_method === "till" ? (credentials.till_number || credentials.business_shortcode) : credentials.business_shortcode,
    PhoneNumber: phoneNumber,
    CallBackURL: callbackUrl(credentials.tenant_slug),
    AccountReference: reference.slice(0, 12),
    TransactionDesc: "M-Verify payment"
  };

  const darajaResponse = await fetch(stkPushUrl(credentials.environment), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await readDarajaJson(darajaResponse);
  const status: StkPromptStatus = darajaResponse.ok && body.ResponseCode === "0" ? "PENDING" : "FAILED";

  await pool.execute(
    `UPDATE stk_prompt_requests
     SET merchant_request_id = ?, checkout_request_id = ?, status = ?, result_code = ?, result_description = ?, raw_request_json = ?
     WHERE id = ?`,
    [
      body.MerchantRequestID ? String(body.MerchantRequestID) : null,
      body.CheckoutRequestID ? String(body.CheckoutRequestID) : null,
      status,
      body.ResponseCode ? String(body.ResponseCode) : body.errorCode ? String(body.errorCode) : null,
      String(body.CustomerMessage ?? body.ResponseDescription ?? body.errorMessage ?? ""),
      JSON.stringify({ request: payload, response: body }),
      insert.insertId
    ]
  );

  const prompt = await loadPrompt(insert.insertId, auth);
  return responseFromPrompt(prompt);
}

async function queryDarajaStatus(row: StkRequestRow): Promise<void> {
  if (!row.checkout_request_id || !["PENDING", "REQUESTED"].includes(row.status)) return;
  const credentials = await tenantCredentials(Number(row.tenant_id));
  const passkey = decryptCredential(credentials.passkey_encrypted);
  if (!passkey) return;
  const token = await requestAccessToken(credentials);
  const time = timestamp();
  const response = await fetch(stkQueryUrl(credentials.environment), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      BusinessShortCode: credentials.business_shortcode,
      Password: stkPassword(credentials.business_shortcode, passkey, time),
      Timestamp: time,
      CheckoutRequestID: row.checkout_request_id
    })
  });
  const body = await readDarajaJson(response);
  const resultCode = body.ResultCode === undefined ? null : String(body.ResultCode);
  if (resultCode && resultCode !== "0" && !deferredProviderTimeoutCodes.has(resultCode)) {
    const status: StkPromptStatus = resultCode === "1032" ? "CANCELLED" : "FAILED";
    await pool.execute(
      `UPDATE stk_prompt_requests
       SET status = ?, result_code = ?, result_description = ?, raw_result_json = ?, completed_at = UTC_TIMESTAMP()
       WHERE id = ? AND status IN ('REQUESTED', 'PENDING')`,
      [status, resultCode, String(body.ResultDesc ?? body.errorMessage ?? "STK prompt failed."), JSON.stringify(body), row.id]
    );
  }
}

export async function getStkPrompt(id: number, auth: AuthContext): Promise<StkPromptResponse> {
  let row = await loadPrompt(id, auth);
  if (["PENDING", "REQUESTED"].includes(row.status)) {
    await pool.execute(
      `UPDATE stk_prompt_requests
       SET status = 'TIMED_OUT', result_description = 'Customer did not complete the M-Pesa prompt in time.', completed_at = UTC_TIMESTAMP()
       WHERE id = ? AND status IN ('REQUESTED', 'PENDING') AND expires_at <= UTC_TIMESTAMP()`,
      [id]
    );
    row = await loadPrompt(id, auth);
    if (["PENDING", "REQUESTED"].includes(row.status)) {
      await queryDarajaStatus(row).catch(() => undefined);
    }
    row = await loadPrompt(id, auth);
  }
  return responseFromPrompt(row, await loadPayment(row.payment_id));
}

function metadataValue(body: StkCallbackBody, name: string): string | number | undefined {
  return body.Body?.stkCallback?.CallbackMetadata?.Item?.find((item) => item.Name === name)?.Value;
}

export async function handleStkCallback(body: StkCallbackBody): Promise<void> {
  const callback = body.Body?.stkCallback;
  if (!callback?.CheckoutRequestID) return;
  const resultCode = String(callback.ResultCode ?? "");
  const resultDesc = callback.ResultDesc ?? null;

  const [rows] = await pool.execute<StkRequestRow[]>(
    `SELECT id, tenant_id, phone_number, amount, reference, checkout_request_id, status, result_description, payment_id, expires_at
     FROM stk_prompt_requests
     WHERE checkout_request_id = ?
     LIMIT 1`,
    [callback.CheckoutRequestID]
  );
  const row = rows[0];
  if (!row) return;

  if (resultCode !== "0") {
    if (deferredProviderTimeoutCodes.has(resultCode)) {
      await pool.execute(
        `UPDATE stk_prompt_requests
         SET result_code = ?, result_description = ?, raw_result_json = ?
         WHERE id = ? AND status IN ('REQUESTED', 'PENDING')`,
        [resultCode, resultDesc, JSON.stringify(body), row.id]
      );
      return;
    }
    const status: StkPromptStatus = resultCode === "1032" ? "CANCELLED" : "FAILED";
    await pool.execute(
      `UPDATE stk_prompt_requests
       SET status = ?, result_code = ?, result_description = ?, raw_result_json = ?, completed_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [status, resultCode, resultDesc, JSON.stringify(body), row.id]
    );
    return;
  }

  const receipt = metadataValue(body, "MpesaReceiptNumber");
  const amount = metadataValue(body, "Amount") ?? row.amount;
  const phone = metadataValue(body, "PhoneNumber") ?? row.phone_number;
  const transactionDate = metadataValue(body, "TransactionDate");
  if (!receipt) {
    await pool.execute(
      `UPDATE stk_prompt_requests
       SET status = 'FAILED', result_code = ?, result_description = ?, raw_result_json = ?, completed_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [resultCode, "STK succeeded but Safaricom did not return a receipt number.", JSON.stringify(body), row.id]
    );
    return;
  }

  await withTransaction(async (connection) => {
    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO payments (
        tenant_id, phone_number, customer_name, reference, transaction_code, amount, payment_channel, status, payment_time, raw_receipt_json
      ) VALUES (?, ?, NULL, ?, ?, ?, 'MPESA_STK', 'PAID', ?, ?)
      ON DUPLICATE KEY UPDATE
        tenant_id = VALUES(tenant_id),
        phone_number = VALUES(phone_number),
        reference = COALESCE(VALUES(reference), reference),
        amount = VALUES(amount),
        status = 'PAID',
        payment_time = COALESCE(VALUES(payment_time), payment_time),
        raw_receipt_json = VALUES(raw_receipt_json)`,
      [
        row.tenant_id,
        normalizePhoneNumber(phone),
        row.reference,
        String(receipt).toUpperCase(),
        Number(amount),
        parseDarajaTime(transactionDate),
        JSON.stringify(body)
      ]
    );
    const paymentId = insert.insertId || (await findPaymentId(connection, String(receipt).toUpperCase()));
    await connection.execute(
      `UPDATE stk_prompt_requests
       SET status = 'PAID', result_code = ?, result_description = ?, payment_id = ?, raw_result_json = ?, completed_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [resultCode, resultDesc, paymentId, JSON.stringify(body), row.id]
    );
  });
}

async function findPaymentId(connection: { execute: typeof pool.execute }, receipt: string): Promise<number | null> {
  const [rows] = await connection.execute<Array<RowDataPacket & { id: number }>>(
    "SELECT id FROM payments WHERE transaction_code = ? LIMIT 1",
    [receipt]
  );
  return rows[0]?.id ? Number(rows[0].id) : null;
}
