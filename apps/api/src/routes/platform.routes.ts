import { Router } from "express";
import type { RowDataPacket } from "../db.js";
import { pool } from "../db.js";
import { asyncHandler } from "../http.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";

type SummaryRow = RowDataPacket & {
  business_count: number;
  active_business_count: number;
  transaction_count: number;
  total_volume: string | null;
  platform_revenue: string | null;
  today_volume: string | null;
  today_platform_revenue: string | null;
};

type BreakdownRow = RowDataPacket & {
  id: number;
  name: string;
  slug: string;
  status: "active" | "disabled";
  commission_rate_pct: string;
  transaction_count: number;
  total_volume: string | null;
  platform_revenue: string | null;
  last_payment_at: Date | string | null;
};

export const platformRouter = Router();

platformRouter.use("/platform", requireAuth, requireRoles("admin"));

platformRouter.get(
  "/platform/dashboard",
  asyncHandler(async (_request, response) => {
    const [summaryRows] = await pool.execute<SummaryRow[]>(
      `SELECT
        COUNT(DISTINCT t.id) AS business_count,
        COUNT(DISTINCT CASE WHEN t.status = 'active' THEN t.id END) AS active_business_count,
        COUNT(p.id) AS transaction_count,
        COALESCE(SUM(p.amount), 0) AS total_volume,
        COALESCE(SUM(p.amount * COALESCE(t.commission_rate_pct, 0) / 100), 0) AS platform_revenue,
        COALESCE(SUM(CASE WHEN DATE(p.created_at) = UTC_DATE() THEN p.amount ELSE 0 END), 0) AS today_volume,
        COALESCE(SUM(CASE WHEN DATE(p.created_at) = UTC_DATE()
          THEN p.amount * COALESCE(t.commission_rate_pct, 0) / 100 ELSE 0 END), 0) AS today_platform_revenue
       FROM tenants t
       LEFT JOIN payments p ON p.tenant_id = t.id AND p.status = 'PAID'`
    );

    const [breakdownRows] = await pool.execute<BreakdownRow[]>(
      `SELECT
        t.id, t.name, t.slug, t.status, t.commission_rate_pct,
        COUNT(p.id) AS transaction_count,
        COALESCE(SUM(p.amount), 0) AS total_volume,
        COALESCE(SUM(p.amount * COALESCE(t.commission_rate_pct, 0) / 100), 0) AS platform_revenue,
        MAX(p.payment_time) AS last_payment_at
       FROM tenants t
       LEFT JOIN payments p ON p.tenant_id = t.id AND p.status = 'PAID'
       GROUP BY t.id, t.name, t.slug, t.status, t.commission_rate_pct
       ORDER BY platform_revenue DESC, total_volume DESC, t.name ASC`
    );

    const summary = summaryRows[0] ?? {
      business_count: 0,
      active_business_count: 0,
      transaction_count: 0,
      total_volume: "0",
      platform_revenue: "0",
      today_volume: "0",
      today_platform_revenue: "0"
    };

    response.json({
      kpis: {
        businesses: Number(summary.business_count ?? 0),
        activeBusinesses: Number(summary.active_business_count ?? 0),
        paidTransactions: Number(summary.transaction_count ?? 0),
        totalPaymentVolume: String(summary.total_volume ?? "0"),
        platformRevenue: String(summary.platform_revenue ?? "0"),
        todayPaymentVolume: String(summary.today_volume ?? "0"),
        todayPlatformRevenue: String(summary.today_platform_revenue ?? "0")
      },
      breakdown: breakdownRows.map((row) => ({
        businessId: Number(row.id),
        businessName: row.name,
        slug: row.slug,
        status: row.status,
        commissionRatePct: String(row.commission_rate_pct ?? "0"),
        transactionCount: Number(row.transaction_count ?? 0),
        totalPaymentVolume: String(row.total_volume ?? "0"),
        platformRevenue: String(row.platform_revenue ?? "0"),
        lastPaymentAt: row.last_payment_at ? new Date(row.last_payment_at).toISOString() : null
      }))
    });
  })
);
