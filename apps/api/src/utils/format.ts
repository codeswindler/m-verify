import { defaultPermissionsForRole, userModules, type SafeUser, type UserPermissions, type UserRole } from "@m-verify/shared";
import type { RowDataPacket } from "../db.js";

export function normalizeTransactionCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{6,40}$/.test(normalized)) {
    throw new Error("Invalid M-Pesa transaction code");
  }
  return normalized;
}

export function normalizePhoneNumber(value: string | number): string {
  let digits = String(value).trim().replace(/[^\d]/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `254${digits.slice(1)}`;
  }
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) {
    digits = `254${digits}`;
  }

  if (!/^254(?:7|1)\d{8}$/.test(digits)) {
    throw new Error("Invalid Kenyan phone number");
  }

  return digits;
}

export function normalizePayerIdentifier(value: string | number): string {
  const rawValue = String(value).trim();
  if (!rawValue) {
    throw new Error("Missing payer identifier");
  }

  try {
    return normalizePhoneNumber(rawValue);
  } catch {
    return rawValue.slice(0, 120);
  }
}

export function maskPhoneNumber(phoneNumber: string): string {
  if (phoneNumber.length < 9) return "****";
  return `${phoneNumber.slice(0, 6)}***${phoneNumber.slice(-3)}`;
}

export function moneyToCents(value: string | number): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) {
    throw new Error("Invalid amount");
  }
  return Math.round(amount * 100);
}

export function toMysqlDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function parseDarajaTime(value: string | number | undefined): string | null {
  if (!value) return null;
  const text = String(value);
  if (!/^\d{14}$/.test(text)) return null;

  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6)) - 1;
  const day = Number(text.slice(6, 8));
  const hour = Number(text.slice(8, 10));
  const minute = Number(text.slice(10, 12));
  const second = Number(text.slice(12, 14));

  // Daraja sends this compact timestamp as Kenya wall-clock time without an
  // offset. Store UTC consistently so every client can render it correctly.
  const kenyaOffsetMs = 3 * 60 * 60 * 1000;
  return toMysqlDate(new Date(Date.UTC(year, month, day, hour, minute, second) - kenyaOffsetMs));
}

export function toSafeUser(row: RowDataPacket & Record<string, unknown>): SafeUser {
  const role = row.role as UserRole;
  return {
    id: Number(row.id),
    username: String(row.username),
    fullName: String(row.full_name ?? row.fullName ?? ""),
    role,
    permissions: parseUserPermissions(row.module_permissions ?? row.permissions, role),
    disabled: Boolean(row.disabled),
    tenantId: row.tenant_id === null || row.tenantId === null || (row.tenant_id === undefined && row.tenantId === undefined)
      ? null
      : Number(row.tenant_id ?? row.tenantId),
    tenantName: row.tenant_name === null || row.tenantName === null || (row.tenant_name === undefined && row.tenantName === undefined)
      ? null
      : String(row.tenant_name ?? row.tenantName)
  };
}

export function parseUserPermissions(value: unknown, role: UserRole): UserPermissions {
  const defaults = defaultPermissionsForRole(role);
  if (value === null || value === undefined || value === "") return defaults;

  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return defaults;
    }
  }

  if (!parsed || typeof parsed !== "object") return defaults;
  const permissions = { ...defaults };
  const source = parsed as Record<string, unknown>;
  for (const module of userModules) {
    if (typeof source[module] === "boolean") {
      permissions[module] = source[module];
    }
  }
  return permissions;
}

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<[keyof T, string]>): string {
  const header = columns.map(([, label]) => escapeCsv(label)).join(",");
  const body = rows.map((row) => columns.map(([key]) => escapeCsv(row[key])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}
