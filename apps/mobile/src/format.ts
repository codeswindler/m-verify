import type { PaymentSummary } from "@m-verify/shared";

export type DatePreset = "today" | "7d" | "30d" | "all";
const kenyaTimeZone = "Africa/Nairobi";

export function money(value: unknown, compact = false) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "KES 0";
  if (compact && Math.abs(numeric) >= 1_000_000) {
    return `KES ${(numeric / 1_000_000).toFixed(1)}M`;
  }
  if (compact && Math.abs(numeric) >= 1_000) {
    return `KES ${Math.round(numeric / 1_000)}K`;
  }
  return `KES ${numeric.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
}

export function inputDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: kenyaTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function dateKey(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : inputDate(parsed);
}

export function dateTime(value?: string | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-KE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: kenyaTimeZone
  }).format(new Date(value));
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: kenyaTimeZone
  }).format(new Date(`${value}T00:00:00+03:00`));
}

export function paymentName(payment: PaymentSummary) {
  return payment.customerName || payment.reference || payment.transactionCode || "M-Pesa customer";
}

export function amount(payment: PaymentSummary) {
  const numeric = Number(payment.amount);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function datesForPreset(preset: DatePreset) {
  const to = inputDate(new Date());
  const from = new Date(`${to}T12:00:00+03:00`);

  if (preset === "today") {
    return { from: to, to };
  }

  if (preset === "7d") {
    from.setDate(from.getDate() - 6);
    return { from: inputDate(from), to };
  }

  if (preset === "30d") {
    from.setDate(from.getDate() - 29);
    return { from: inputDate(from), to };
  }

  return { from: "", to: "" };
}

export function paymentInPreset(payment: PaymentSummary, preset: DatePreset) {
  if (preset === "all") return true;
  const key = dateKey(payment.paymentTime);
  if (!key) return false;
  const range = datesForPreset(preset);
  return key >= range.from && key <= range.to;
}

export function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("en-KE", {
    month: "long",
    year: "numeric",
    timeZone: kenyaTimeZone
  }).format(date);
}
