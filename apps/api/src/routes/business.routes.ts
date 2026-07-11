import { Router } from "express";
import type { PaymentSummary } from "@m-verify/shared";
import type { RowDataPacket } from "../db.js";
import { pool } from "../db.js";
import { AppError, asyncHandler } from "../http.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { maskPhoneNumber, toSafeUser } from "../utils/format.js";

type BusinessKpiRow = RowDataPacket & {
  transaction_count: number;
  total_volume: string | null;
  today_volume: string | null;
  month_volume: string | null;
  verified_count: number;
};

type StaffKpiRow = RowDataPacket & {
  staff_count: number;
  active_staff_count: number;
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

export const businessRouter = Router();

businessRouter.use("/business", requireAuth, requireRoles("manager"));

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

businessRouter.get(
  "/business/dashboard",
  asyncHandler(async (request, response) => {
    const tenantId = request.auth!.user.tenantId;
    if (!tenantId) {
      throw new AppError(400, "Business user is not assigned to a business", "BUSINESS_REQUIRED");
    }

    const [summaryRows] = await pool.execute<BusinessKpiRow[]>(
      `SELECT
        COUNT(p.id) AS transaction_count,
        COALESCE(SUM(p.amount), 0) AS total_volume,
        COALESCE(SUM(CASE WHEN DATE(COALESCE(p.payment_time, p.created_at)) = UTC_DATE() THEN p.amount ELSE 0 END), 0) AS today_volume,
        COALESCE(SUM(CASE
          WHEN COALESCE(p.payment_time, p.created_at) >= DATE_FORMAT(UTC_DATE(), '%Y-%m-01')
           AND COALESCE(p.payment_time, p.created_at) < DATE_ADD(LAST_DAY(UTC_DATE()), INTERVAL 1 DAY)
          THEN p.amount ELSE 0 END), 0) AS month_volume,
        COUNT(CASE WHEN p.verified_status = TRUE THEN 1 END) AS verified_count
       FROM payments p
       WHERE p.tenant_id = ? AND p.status = 'PAID'`,
      [tenantId]
    );

    const [staffRows] = await pool.execute<StaffKpiRow[]>(
      `SELECT
        COUNT(*) AS staff_count,
        COUNT(CASE WHEN disabled = FALSE THEN 1 END) AS active_staff_count
       FROM users
       WHERE tenant_id = ? AND role <> 'admin'`,
      [tenantId]
    );

    const [paymentRows] = await pool.execute<PaymentRow[]>(
      `SELECT
        p.id, p.tenant_id, t.name AS tenant_name,
        p.customer_name, p.reference, p.phone_number, p.transaction_code, p.amount,
        p.payment_channel, p.status, p.payment_time, p.verified_status, p.verified_at,
        u.id AS verified_by_id, u.username AS verified_by_username,
        u.full_name AS verified_by_full_name, u.role AS verified_by_role
       FROM payments p
       LEFT JOIN tenants t ON t.id = p.tenant_id
       LEFT JOIN users u ON u.id = p.verified_by
       WHERE p.tenant_id = ? AND p.status = 'PAID'
       ORDER BY p.payment_time DESC, p.id DESC
       LIMIT 6`,
      [tenantId]
    );

    const summary = summaryRows[0];
    const staff = staffRows[0];

    response.json({
      kpis: {
        paidTransactions: Number(summary?.transaction_count ?? 0),
        totalPaymentVolume: String(summary?.total_volume ?? "0"),
        todayPaymentVolume: String(summary?.today_volume ?? "0"),
        monthPaymentVolume: String(summary?.month_volume ?? "0"),
        verifiedTransactions: Number(summary?.verified_count ?? 0),
        staffUsers: Number(staff?.staff_count ?? 0),
        activeStaffUsers: Number(staff?.active_staff_count ?? 0)
      },
      recentPayments: paymentRows.map(mapPayment)
    });
  })
);
