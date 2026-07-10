import { describe, expect, it } from "vitest";
import {
  maskPhoneNumber,
  moneyToCents,
  normalizePhoneNumber,
  normalizePayerIdentifier,
  normalizeTransactionCode,
  parseDarajaTime,
  toCsv
} from "../utils/format.js";

describe("format utilities", () => {
  it("normalizes Kenyan phone numbers", () => {
    expect(normalizePhoneNumber("0712 345 678")).toBe("254712345678");
    expect(normalizePhoneNumber("+254712345678")).toBe("254712345678");
    expect(normalizePhoneNumber("712345678")).toBe("254712345678");
  });

  it("rejects invalid phone numbers", () => {
    expect(() => normalizePhoneNumber("123")).toThrow("Invalid Kenyan phone number");
  });

  it("normalizes or preserves Daraja payer identifiers", () => {
    expect(normalizePayerIdentifier("0712 345 678")).toBe("254712345678");
    expect(normalizePayerIdentifier("HASHED-PAYER-ABC123XYZ")).toBe("HASHED-PAYER-ABC123XYZ");
  });

  it("normalizes transaction codes", () => {
    expect(normalizeTransactionCode(" rba 123abc1 ")).toBe("RBA123ABC1");
  });

  it("compares money in cents", () => {
    expect(moneyToCents("1200.00")).toBe(120000);
    expect(moneyToCents(1200)).toBe(120000);
  });

  it("masks phone numbers", () => {
    expect(maskPhoneNumber("254712345678")).toBe("254712***678");
  });

  it("parses Daraja timestamps", () => {
    expect(parseDarajaTime("20260703140520")).toBe("2026-07-03 14:05:20");
  });

  it("escapes CSV values", () => {
    expect(toCsv([{ name: 'A "quoted" value', amount: "1,200" }], [["name", "Name"], ["amount", "Amount"]])).toContain(
      '"A ""quoted"" value","1,200"'
    );
  });
});
