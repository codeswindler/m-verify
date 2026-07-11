import { Router, type Request, type Response } from "express";
import { darajaConfirmationSchema } from "@m-verify/shared";
import type { ResultSetHeader, RowDataPacket } from "../db.js";
import { pool } from "../db.js";
import { AppError, asyncHandler } from "../http.js";
import { validateBody } from "../middleware/validate.js";
import { normalizePayerIdentifier, normalizeTransactionCode, parseDarajaTime } from "../utils/format.js";
import { isAllowedCallbackIp } from "../utils/security.js";
import { handleStkCallback } from "../services/stk.js";

export const mpesaRouter = Router();

type CallbackTenantRow = RowDataPacket & {
  id: number;
  name: string;
  slug: string;
  status: "active" | "disabled";
  credentials_active: number | null;
};

async function findTenantForCallback(
  tenantSlug: string | undefined,
  payload: typeof darajaConfirmationSchema._type
): Promise<CallbackTenantRow> {
  if (tenantSlug) {
    const [rows] = await pool.execute<CallbackTenantRow[]>(
      `SELECT t.id, t.name, t.slug, t.status, mc.active AS credentials_active
       FROM tenants t
       LEFT JOIN tenant_mpesa_credentials mc ON mc.tenant_id = t.id
       WHERE t.slug = ?
       LIMIT 1`,
      [tenantSlug]
    );
    const row = rows[0];
    if (!row) throw new AppError(404, "Tenant callback route was not found", "TENANT_NOT_FOUND");
    return row;
  }

  if (payload.BusinessShortCode !== undefined) {
    const [rows] = await pool.execute<CallbackTenantRow[]>(
      `SELECT t.id, t.name, t.slug, t.status, mc.active AS credentials_active
       FROM tenant_mpesa_credentials mc
       INNER JOIN tenants t ON t.id = mc.tenant_id
       WHERE mc.business_shortcode = ?
       LIMIT 1`,
      [String(payload.BusinessShortCode)]
    );
    const row = rows[0];
    if (!row) {
      throw new AppError(404, "No tenant is configured for this M-Pesa shortcode", "SHORTCODE_NOT_CONFIGURED");
    }
    return row;
  }

  const [rows] = await pool.execute<CallbackTenantRow[]>(
    `SELECT t.id, t.name, t.slug, t.status, mc.active AS credentials_active
     FROM tenants t
     LEFT JOIN tenant_mpesa_credentials mc ON mc.tenant_id = t.id
     WHERE t.id = 1
     LIMIT 1`
  );
  const row = rows[0];
  if (!row) throw new AppError(404, "Default tenant is not configured", "TENANT_NOT_FOUND");
  return row;
}

function assertCallbackAllowed(request: Request, tenant: CallbackTenantRow): void {
  if (tenant.status !== "active" || tenant.credentials_active === 0) {
    throw new AppError(403, "Tenant callback is disabled", "TENANT_CALLBACK_DISABLED");
  }

  if (!isAllowedCallbackIp(request.ip ?? "")) {
    throw new AppError(403, "Callback source IP is not allowed", "CALLBACK_IP_FORBIDDEN");
  }
}

function customerNameFromPayload(payload: typeof darajaConfirmationSchema._type): string | null {
  const parts = [payload.FirstName, payload.MiddleName, payload.LastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ").slice(0, 160) : null;
}

async function handleValidation(request: Request, response: Response) {
  const payload = request.body as typeof darajaConfirmationSchema._type;
  const tenant = await findTenantForCallback(request.params.tenantSlug, payload);
  assertCallbackAllowed(request, tenant);
  response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}

async function handleConfirmation(request: Request, response: Response) {
  const payload = request.body as typeof darajaConfirmationSchema._type;
  const tenant = await findTenantForCallback(request.params.tenantSlug, payload);
  assertCallbackAllowed(request, tenant);
  const transactionCode = normalizeTransactionCode(payload.TransID);
  const phoneNumber = normalizePayerIdentifier(payload.MSISDN);
  const customerName = customerNameFromPayload(payload);
  const reference = payload.BillRefNumber?.trim() || null;
  const paymentTime = parseDarajaTime(payload.TransTime);

  await pool.execute<ResultSetHeader>(
    `INSERT INTO payments (
      tenant_id, phone_number, customer_name, reference, transaction_code, amount, payment_channel, status, payment_time, raw_receipt_json
    ) VALUES (?, ?, ?, ?, ?, ?, 'MPESA_C2B', 'PAID', ?, ?)
    ON DUPLICATE KEY UPDATE
      tenant_id = VALUES(tenant_id),
      phone_number = VALUES(phone_number),
      customer_name = COALESCE(VALUES(customer_name), customer_name),
      reference = COALESCE(VALUES(reference), reference),
      amount = VALUES(amount),
      status = 'PAID',
      payment_time = COALESCE(VALUES(payment_time), payment_time),
      raw_receipt_json = VALUES(raw_receipt_json)`,
    [tenant.id, phoneNumber, customerName, reference, transactionCode, payload.TransAmount, paymentTime, JSON.stringify(payload)]
  );

  response.json({ ResultCode: 0, ResultDesc: "Confirmation received" });
}

mpesaRouter.post(
  "/c2b/validation",
  validateBody(darajaConfirmationSchema),
  asyncHandler(handleValidation)
);

mpesaRouter.post(
  "/:tenantSlug/c2b/validation",
  validateBody(darajaConfirmationSchema),
  asyncHandler(handleValidation)
);

mpesaRouter.post(
  "/c2b/confirmation",
  validateBody(darajaConfirmationSchema),
  asyncHandler(handleConfirmation)
);

mpesaRouter.post(
  "/:tenantSlug/c2b/confirmation",
  validateBody(darajaConfirmationSchema),
  asyncHandler(handleConfirmation)
);

mpesaRouter.post(
  "/:tenantSlug/stk/result",
  asyncHandler(async (request, response) => {
    if (!isAllowedCallbackIp(request.ip ?? "")) {
      throw new AppError(403, "Callback source IP is not allowed", "CALLBACK_IP_FORBIDDEN");
    }
    await handleStkCallback(request.body);
    response.json({ ResultCode: 0, ResultDesc: "STK result received" });
  })
);
