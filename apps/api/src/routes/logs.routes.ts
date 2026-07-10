import { Router } from "express";
import { listQuerySchema } from "@m-verify/shared";
import type { VerificationStatus } from "@m-verify/shared";
import type { DbParam, RowDataPacket } from "../db.js";
import { pool } from "../db.js";
import { asyncHandler } from "../http.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import type { AuthContext } from "../types.js";
import { maskPhoneNumber, toCsv } from "../utils/format.js";

type LogRow = RowDataPacket & {
  id: number;
  tenant_id: number | null;
  tenant_name: string | null;
  payment_id: number | null;
  username: string | null;
  role: string | null;
  submitted_phone_number: string;
  submitted_transaction_code: string;
  submitted_amount: string | null;
  submitted_reference: string | null;
  result: VerificationStatus;
  ip_address: string | null;
  user_agent: string | null;
  notes: string | null;
  created_at: Date | string;
};

type CountRow = RowDataPacket & { total: number };

export const logsRouter = Router();

function buildLogWhere(
  query: typeof listQuerySchema._type,
  auth: AuthContext
): { where: string; params: DbParam[] } {
  const clauses: string[] = [];
  const params: DbParam[] = [];

  if (auth.user.role !== "admin") {
    clauses.push("vl.tenant_id = ?");
    params.push(auth.user.tenantId ?? -1);
  } else if (query.tenantId) {
    clauses.push("vl.tenant_id = ?");
    params.push(query.tenantId);
  }

  if (query.search) {
    clauses.push(`(
      vl.submitted_transaction_code LIKE ? OR
      vl.submitted_phone_number LIKE ? OR
      vl.submitted_reference LIKE ? OR
      u.username LIKE ? OR
      t.name LIKE ?
    )`);
    params.push(
      `%${query.search.toUpperCase()}%`,
      `%${query.search.replace(/[^\d]/g, "")}%`,
      `%${query.search}%`,
      `%${query.search}%`,
      `%${query.search}%`
    );
  }

  if (query.status) {
    clauses.push("vl.result = ?");
    params.push(query.status);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

function mapLog(row: LogRow) {
  return {
    id: Number(row.id),
    tenantId: row.tenant_id ? Number(row.tenant_id) : null,
    tenantName: row.tenant_name,
    paymentId: row.payment_id ? Number(row.payment_id) : null,
    username: row.username,
    role: row.role,
    submittedPhoneNumber: maskPhoneNumber(row.submitted_phone_number),
    submittedTransactionCode: row.submitted_transaction_code,
    submittedAmount: row.submitted_amount === null ? "" : String(row.submitted_amount),
    submittedReference: row.submitted_reference,
    result: row.result,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString()
  };
}

const logsSelect = `SELECT
  vl.id, vl.tenant_id, t.name AS tenant_name, vl.payment_id,
  vl.submitted_phone_number, vl.submitted_transaction_code, vl.submitted_amount,
  vl.submitted_reference, vl.result, vl.ip_address, vl.user_agent, vl.notes, vl.created_at,
  u.username, u.role
FROM verification_logs vl
LEFT JOIN tenants t ON t.id = vl.tenant_id
LEFT JOIN users u ON u.id = vl.user_id`;

logsRouter.use("/verification-logs", requireAuth, requireRoles("admin", "manager"));

logsRouter.get(
  "/verification-logs/export.csv",
  validateQuery(listQuerySchema),
  asyncHandler(async (request, response) => {
    const query = request.query as unknown as typeof listQuerySchema._type;
    const { where, params } = buildLogWhere(query, request.auth!);
    const [rows] = await pool.execute<LogRow[]>(
      `${logsSelect} ${where} ORDER BY vl.created_at DESC, vl.id DESC LIMIT 10000`,
      params
    );
    const logs = rows.map(mapLog);

    response.header("content-type", "text/csv");
    response.attachment("verification-logs.csv");
    response.send(
      toCsv(logs, [
        ["id", "ID"],
        ["tenantName", "Business"],
        ["paymentId", "Payment ID"],
        ["username", "User"],
        ["role", "Role"],
        ["submittedPhoneNumber", "Phone Number"],
        ["submittedTransactionCode", "Transaction Code"],
        ["submittedAmount", "Amount"],
        ["submittedReference", "Reference"],
        ["result", "Result"],
        ["ipAddress", "IP Address"],
        ["createdAt", "Created At"]
      ])
    );
  })
);

logsRouter.get(
  "/verification-logs",
  validateQuery(listQuerySchema),
  asyncHandler(async (request, response) => {
    const query = request.query as unknown as typeof listQuerySchema._type;
    const { where, params } = buildLogWhere(query, request.auth!);
    const offset = (query.page - 1) * query.limit;
    const limitSql = Number(query.limit);
    const offsetSql = Number(offset);

    const [rows] = await pool.execute<LogRow[]>(
      `${logsSelect} ${where} ORDER BY vl.created_at DESC, vl.id DESC LIMIT ${limitSql} OFFSET ${offsetSql}`,
      params
    );
    const [countRows] = await pool.execute<CountRow[]>(
      `SELECT COUNT(*) AS total FROM verification_logs vl
       LEFT JOIN tenants t ON t.id = vl.tenant_id
       LEFT JOIN users u ON u.id = vl.user_id ${where}`,
      params
    );

    response.json({
      data: rows.map(mapLog),
      page: query.page,
      limit: query.limit,
      total: Number(countRows[0]?.total ?? 0)
    });
  })
);
