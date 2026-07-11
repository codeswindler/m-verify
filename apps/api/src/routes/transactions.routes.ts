import { Router } from "express";
import { z } from "zod";
import { listQuerySchema, paymentStatuses } from "@m-verify/shared";
import type { PaymentStatus, PaymentSummary } from "@m-verify/shared";
import type { DbParam, RowDataPacket } from "../db.js";
import { pool } from "../db.js";
import { AppError, asyncHandler } from "../http.js";
import { requireAnyPermission, requireAuth, requireRoles } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import type { AuthContext } from "../types.js";
import { maskPhoneNumber, toCsv, toSafeUser } from "../utils/format.js";

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
  status: PaymentStatus;
  payment_time: Date | string | null;
  verified_status: number;
  verified_at: Date | string | null;
  verified_by_id: number | null;
  verified_by_username: string | null;
  verified_by_full_name: string | null;
  verified_by_role: string | null;
};

type CountRow = RowDataPacket & { total: number };

const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const transactionsRouter = Router();

function buildPaymentWhere(
  query: typeof listQuerySchema._type,
  auth: AuthContext
): { where: string; params: DbParam[] } {
  const clauses: string[] = [];
  const params: DbParam[] = [];

  if (auth.user.role !== "admin") {
    clauses.push("p.tenant_id = ?");
    params.push(auth.user.tenantId ?? -1);
  } else if (query.tenantId) {
    clauses.push("p.tenant_id = ?");
    params.push(query.tenantId);
  }

  if (auth.user.role === "waiter") {
    clauses.push("p.verified_status = TRUE");
    clauses.push("p.verified_by = ?");
    params.push(auth.user.id);
  }

  if (query.search) {
    clauses.push("(p.transaction_code LIKE ? OR p.phone_number LIKE ? OR p.reference LIKE ? OR p.customer_name LIKE ? OR t.name LIKE ?)");
    params.push(
      `%${query.search.toUpperCase()}%`,
      `%${query.search.replace(/[^\d]/g, "")}%`,
      `%${query.search}%`,
      `%${query.search}%`,
      `%${query.search}%`
    );
  }

  if (query.status && paymentStatuses.includes(query.status as PaymentStatus)) {
    clauses.push("p.status = ?");
    params.push(query.status);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

function mapPayment(row: PaymentRow): PaymentSummary {
  return {
    id: Number(row.id),
    tenantId: row.tenant_id ? Number(row.tenant_id) : null,
    tenantName: row.tenant_name,
    customerName: row.customer_name,
    reference: row.reference,
    phoneNumber: maskPhoneNumber(row.phone_number),
    transactionCode: row.transaction_code,
    amount: String(row.amount),
    paymentChannel: row.payment_channel,
    status: row.status,
    paymentTime: row.payment_time ? new Date(row.payment_time).toISOString() : null,
    verifiedStatus: Boolean(row.verified_status),
    verifiedBy: row.verified_by_id
      ? toSafeUser({
          id: row.verified_by_id,
          username: row.verified_by_username,
          full_name: row.verified_by_full_name,
          role: row.verified_by_role,
          disabled: false
        } as RowDataPacket & Record<string, unknown>)
      : null,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null
  };
}

const paymentSelect = `SELECT
  p.id, p.tenant_id, t.name AS tenant_name,
  p.customer_name, p.reference, p.phone_number, p.transaction_code, p.amount, p.payment_channel, p.status, p.payment_time,
  p.verified_status, p.verified_at,
  u.id AS verified_by_id, u.username AS verified_by_username, u.full_name AS verified_by_full_name, u.role AS verified_by_role
FROM payments p
LEFT JOIN tenants t ON t.id = p.tenant_id
LEFT JOIN users u ON u.id = p.verified_by`;

transactionsRouter.use("/transactions", requireAuth, requireRoles("admin", "manager", "waiter"), requireAnyPermission("transactions", "sales"));

transactionsRouter.get(
  "/transactions/export.csv",
  validateQuery(listQuerySchema),
  asyncHandler(async (request, response) => {
    const query = request.query as unknown as typeof listQuerySchema._type;
    const { where, params } = buildPaymentWhere(query, request.auth!);
    const [rows] = await pool.execute<PaymentRow[]>(
      `${paymentSelect} ${where} ORDER BY ${request.auth!.user.role === "waiter" ? "p.verified_at" : "p.payment_time"} DESC, p.id DESC LIMIT 10000`,
      params
    );
    const payments = rows.map(mapPayment).map((payment) => ({
      id: payment.id,
      tenantId: payment.tenantId,
      tenantName: payment.tenantName,
      customerName: payment.customerName,
      reference: payment.reference,
      phoneNumber: payment.phoneNumber,
      transactionCode: payment.transactionCode,
      amount: payment.amount,
      paymentChannel: payment.paymentChannel,
      status: payment.status,
      paymentTime: payment.paymentTime,
      verifiedStatus: payment.verifiedStatus,
      verifiedBy: payment.verifiedBy?.username ?? "",
      verifiedAt: payment.verifiedAt
    }));

    response.header("content-type", "text/csv");
    response.attachment("transactions.csv");
    const columns: Array<[keyof (typeof payments)[number], string]> = [
        ["id", "ID"],
        ["customerName", "Customer"],
        ["reference", "Reference"],
        ["phoneNumber", "Phone Number"],
        ["transactionCode", "Transaction Code"],
        ["amount", "Amount"],
        ["paymentChannel", "Channel"],
        ["status", "Status"],
        ["paymentTime", "Payment Time"],
        ["verifiedStatus", "Verified"],
        ["verifiedBy", "Verified By"],
        ["verifiedAt", "Verified At"]
      ];
    if (request.auth!.user.role === "admin") {
      columns.splice(1, 0, ["tenantName", "Business"]);
    }

    response.send(toCsv(payments, columns));
  })
);

transactionsRouter.get(
  "/transactions",
  validateQuery(listQuerySchema),
  asyncHandler(async (request, response) => {
    const query = request.query as unknown as typeof listQuerySchema._type;
    const { where, params } = buildPaymentWhere(query, request.auth!);
    const offset = (query.page - 1) * query.limit;
    const limitSql = Number(query.limit);
    const offsetSql = Number(offset);

    const [rows] = await pool.execute<PaymentRow[]>(
      `${paymentSelect} ${where} ORDER BY ${request.auth!.user.role === "waiter" ? "p.verified_at" : "p.payment_time"} DESC, p.id DESC LIMIT ${limitSql} OFFSET ${offsetSql}`,
      params
    );
    const [countRows] = await pool.execute<CountRow[]>(
      `SELECT COUNT(*) AS total FROM payments p LEFT JOIN tenants t ON t.id = p.tenant_id ${where}`,
      params
    );

    response.json({
      data: rows.map(mapPayment),
      page: query.page,
      limit: query.limit,
      total: Number(countRows[0]?.total ?? 0)
    });
  })
);

transactionsRouter.get(
  "/transactions/:id",
  asyncHandler(async (request, response) => {
    const { id } = idParamsSchema.parse(request.params);
    const tenantClause = request.auth!.user.role === "admin" ? "" : " AND p.tenant_id = ?";
    const waiterClause = request.auth!.user.role === "waiter" ? " AND p.verified_status = TRUE AND p.verified_by = ?" : "";
    const params: DbParam[] = [id];
    if (request.auth!.user.role !== "admin") {
      params.push(request.auth!.user.tenantId ?? -1);
    }
    if (request.auth!.user.role === "waiter") {
      params.push(request.auth!.user.id);
    }
    const [rows] = await pool.execute<PaymentRow[]>(`${paymentSelect} WHERE p.id = ?${tenantClause}${waiterClause} LIMIT 1`, params);
    const row = rows[0];
    if (!row) {
      throw new AppError(404, "Transaction not found", "TRANSACTION_NOT_FOUND");
    }
    response.json(mapPayment(row));
  })
);
