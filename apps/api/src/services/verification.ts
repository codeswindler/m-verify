import type { PaymentLookupResponse, PaymentStatus, PaymentSummary, VerificationResponse, VerificationStatus } from "@m-verify/shared";
import { pool, withTransaction, type DbParam, type QueryExecutor, type RowDataPacket } from "../db.js";
import type { AuthContext } from "../types.js";
import { maskPhoneNumber, moneyToCents, normalizePhoneNumber, normalizeTransactionCode, toSafeUser } from "../utils/format.js";

type VerificationInput = {
  paymentId?: number;
  phoneNumber?: string;
  transactionCode?: string;
  amount?: number;
  reference?: string;
  billNumber?: string;
};

type PaymentRow = RowDataPacket & {
  id: number;
  tenant_id: number | null;
  tenant_name: string | null;
  customer_name: string | null;
  reference: string | null;
  bill_number: string | null;
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

type AuditContext = {
  auth: AuthContext;
  ipAddress?: string;
  userAgent?: string;
};

type PreparedLookup = {
  paymentId: number | null;
  phoneNumber: string | null;
  transactionCode: string | null;
  reference: string | null;
  amount: number | null;
};

const messages: Record<VerificationStatus, string> = {
  VERIFIED: "Payment received. Formal verification recorded.",
  NOT_FOUND: "No received payment matched those details.",
  AMOUNT_MISMATCH: "Payment found, but the amount does not match.",
  ALREADY_VERIFIED: "This payment was already verified.",
  ERROR: "Payment could not be verified."
};

const paymentSelect = `SELECT
  p.id, p.tenant_id, t.name AS tenant_name,
  p.customer_name, p.reference, p.bill_number, p.phone_number, p.transaction_code, p.amount, p.payment_channel, p.status, p.payment_time,
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
    billNumber: payment.bill_number,
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

function prepareLookup(input: VerificationInput): PreparedLookup {
  const paymentId = input.paymentId ? Number(input.paymentId) : null;
  const rawPhone = input.phoneNumber?.trim();
  const rawTransactionCode = input.transactionCode?.trim();
  const reference = input.reference?.trim() || null;
  const transactionCode = rawTransactionCode ? normalizeTransactionCode(rawTransactionCode) : null;
  let phoneNumber: string | null = null;

  if (rawPhone) {
    try {
      phoneNumber = normalizePhoneNumber(rawPhone);
    } catch (error) {
      if (!transactionCode && !reference) {
        throw error;
      }
    }
  }

  if (!paymentId && !phoneNumber && !transactionCode && !reference) {
    throw new Error("Select a payment or provide a phone number, M-Pesa code, or reference code");
  }

  return { paymentId, phoneNumber, transactionCode, reference, amount: input.amount ?? null };
}

async function findReceivedPayment(
  executor: QueryExecutor,
  lookup: PreparedLookup,
  auth: AuthContext,
  forUpdate: boolean
): Promise<PaymentRow[]> {
  const clauses = ["p.tenant_id = ?", "p.status = 'PAID'"];
  const params: DbParam[] = [auth.user.tenantId ?? -1];

  if (lookup.paymentId) {
    clauses.push("p.id = ?");
    params.push(lookup.paymentId);
  }
  if (lookup.transactionCode) {
    clauses.push("p.transaction_code = ?");
    params.push(lookup.transactionCode);
  }
  if (lookup.phoneNumber) {
    clauses.push("p.phone_number = ?");
    params.push(lookup.phoneNumber);
  }
  if (lookup.reference) {
    clauses.push("p.reference = ?");
    params.push(lookup.reference);
  }

  const lockClause = forUpdate ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<PaymentRow[]>(
    `${paymentSelect}
     WHERE ${clauses.join(" AND ")}
     ORDER BY p.payment_time DESC, p.id DESC
     LIMIT 2${lockClause}`,
    params
  );
  return rows;
}

export async function searchReceivedPayments(
  query: string,
  limit: number,
  auth: AuthContext
): Promise<PaymentSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const clauses = ["p.tenant_id = ?", "p.status = 'PAID'"];
  const params: DbParam[] = [auth.user.tenantId ?? -1];
  const searchClauses: string[] = [];
  const normalizedCode = trimmed.toUpperCase().replace(/\s+/g, "");

  searchClauses.push("p.transaction_code LIKE ?");
  params.push(`%${normalizedCode}%`);

  searchClauses.push("p.customer_name LIKE ?");
  params.push(`%${trimmed}%`);

  searchClauses.push("p.bill_number LIKE ?");
  params.push(`%${trimmed}%`);

  const numericAmount = Number(trimmed.replace(/,/g, ""));
  if (Number.isFinite(numericAmount) && numericAmount >= 0) {
    searchClauses.push("p.amount = ?");
    params.push(numericAmount);
  }

  clauses.push(`(${searchClauses.join(" OR ")})`);

  const [rows] = await pool.execute<PaymentRow[]>(
    `${paymentSelect}
     WHERE ${clauses.join(" AND ")}
     ORDER BY p.verified_status ASC, p.payment_time DESC, p.id DESC
     LIMIT ${Number(limit)}`,
    params
  );

  return rows.map(paymentToSummary);
}

async function insertLog(
  executor: QueryExecutor,
  input: {
    paymentId?: number | null;
    auth: AuthContext;
    phoneNumber?: string | null;
    transactionCode?: string | null;
    amount?: number | null;
    reference?: string | null;
    result: VerificationStatus;
    ipAddress?: string;
    userAgent?: string;
    notes?: string;
  }
): Promise<void> {
  await executor.execute(
    `INSERT INTO verification_logs (
      tenant_id, payment_id, user_id, device_session_id, submitted_phone_number, submitted_transaction_code,
      submitted_amount, submitted_reference, result, ip_address, user_agent, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.auth.user.tenantId,
      input.paymentId ?? null,
      input.auth.user.id,
      input.auth.sessionId,
      (input.phoneNumber ?? "").slice(0, 120),
      (input.transactionCode ?? "").slice(0, 40),
      input.amount ?? null,
      input.reference ?? null,
      input.result,
      input.ipAddress ?? null,
      input.userAgent?.slice(0, 255) ?? null,
      input.notes ?? null
    ]
  );
}

export async function lookupPayment(input: VerificationInput, audit: AuditContext): Promise<PaymentLookupResponse> {
  let lookup: PreparedLookup;
  try {
    lookup = prepareLookup(input);
  } catch (error) {
    return { found: false, message: error instanceof Error ? error.message : "Invalid lookup details." };
  }

  const rows = await findReceivedPayment(pool, lookup, audit.auth, false);
  if (rows.length > 1) {
    return {
      found: false,
      message: "More than one received payment matched. Add another detail such as M-Pesa code, phone, or reference."
    };
  }

  const payment = rows[0];
  if (!payment) {
    return { found: false, message: messages.NOT_FOUND };
  }

  const amountMatches = lookup.amount === null ? undefined : moneyToCents(payment.amount) === moneyToCents(lookup.amount);
  const alreadyVerified = Boolean(payment.verified_status);
  return {
    found: true,
    amountMatches,
    alreadyVerified,
    message: amountMatches === false ? messages.AMOUNT_MISMATCH : "Received payment found.",
    payment: paymentToSummary(payment)
  };
}

export async function verifyPayment(
  input: VerificationInput,
  audit: AuditContext
): Promise<VerificationResponse> {
  let lookup: PreparedLookup;
  try {
    lookup = prepareLookup(input);
  } catch (error) {
    await insertLog(pool, {
      auth: audit.auth,
      paymentId: input.paymentId ?? null,
      phoneNumber: input.phoneNumber,
      transactionCode: input.transactionCode,
      amount: input.amount ?? null,
      reference: input.reference,
      result: "ERROR",
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
      notes: error instanceof Error ? error.message : "Invalid verification input"
    });
    return { result: "ERROR", message: error instanceof Error ? error.message : messages.ERROR };
  }

  return withTransaction(async (connection) => {
    const rows = await findReceivedPayment(connection, lookup, audit.auth, true);
    if (rows.length > 1) {
      await insertLog(connection, {
        auth: audit.auth,
        paymentId: lookup.paymentId,
        phoneNumber: lookup.phoneNumber,
        transactionCode: lookup.transactionCode,
        amount: lookup.amount,
        reference: lookup.reference,
        result: "NOT_FOUND",
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
        notes: "Multiple received payments matched the submitted identifiers"
      });
      return {
        result: "NOT_FOUND",
        message: "More than one received payment matched. Add another detail such as M-Pesa code, phone, or reference."
      };
    }

    const payment = rows[0];
    if (!payment) {
      await insertLog(connection, {
        auth: audit.auth,
        paymentId: lookup.paymentId,
        phoneNumber: lookup.phoneNumber,
        transactionCode: lookup.transactionCode,
        amount: lookup.amount,
        reference: lookup.reference,
        result: "NOT_FOUND",
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent
      });
      return { result: "NOT_FOUND", message: messages.NOT_FOUND };
    }

    const billNumber = input.billNumber?.trim() || null;

    let result: VerificationStatus;
    if (lookup.amount !== null && moneyToCents(payment.amount) !== moneyToCents(lookup.amount)) {
      result = "AMOUNT_MISMATCH";
    } else if (Boolean(payment.verified_status)) {
      result = "ALREADY_VERIFIED";
    } else if (!billNumber) {
      await insertLog(connection, {
        paymentId: Number(payment.id),
        auth: audit.auth,
        phoneNumber: lookup.phoneNumber,
        transactionCode: lookup.transactionCode,
        amount: lookup.amount,
        reference: lookup.reference,
        result: "ERROR",
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
        notes: "Bill number was not provided"
      });
      return { result: "ERROR", message: "Enter a bill number to verify this payment.", payment: paymentToSummary(payment) };
    } else {
      result = "VERIFIED";
      try {
        await connection.execute(
          "UPDATE payments SET verified_status = TRUE, verified_by = ?, verified_at = UTC_TIMESTAMP(), bill_number = ? WHERE id = ?",
          [audit.auth.user.id, billNumber, payment.id]
        );
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "ER_DUP_ENTRY") {
          await insertLog(connection, {
            paymentId: Number(payment.id),
            auth: audit.auth,
            phoneNumber: lookup.phoneNumber,
            transactionCode: lookup.transactionCode,
            amount: lookup.amount,
            reference: lookup.reference,
            result: "ERROR",
            ipAddress: audit.ipAddress,
            userAgent: audit.userAgent,
            notes: `Duplicate bill number ${billNumber}`
          });
          return {
            result: "ERROR",
            message: `Bill number ${billNumber} is already used for another payment.`,
            payment: paymentToSummary(payment)
          };
        }
        throw error;
      }
      payment.verified_status = 1;
      payment.verified_at = new Date();
      payment.bill_number = billNumber;
      payment.verified_by_id = audit.auth.user.id;
      payment.verified_by_username = audit.auth.user.username;
      payment.verified_by_full_name = audit.auth.user.fullName;
      payment.verified_by_role = audit.auth.user.role;
    }

    await insertLog(connection, {
      paymentId: Number(payment.id),
      auth: audit.auth,
      phoneNumber: lookup.phoneNumber,
      transactionCode: lookup.transactionCode,
      amount: lookup.amount,
      reference: lookup.reference,
      result,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent
    });

    return {
      result,
      message: messages[result],
      payment: paymentToSummary(payment)
    };
  });
}
