import { describe, expect, it } from "vitest";
import { buildPaymentReceiptMarkup, buildPaymentReceiptShareText, buildWhatsAppReceiptUrl, formatReceiptAmount, formatReceiptDate, type PaymentReceipt } from "@m-verify/shared";

const receipt: PaymentReceipt = {
  receiptNumber: "MVR-00000042",
  issuedAt: "2026-07-13T19:20:00.000Z",
  businessName: "Test & Club",
  payment: {
    id: 42,
    tenantId: 3,
    tenantName: "Test & Club",
    customerName: "A <Customer>",
    reference: "Table 7",
    phoneNumber: "2547***123",
    transactionCode: "TST123ABC",
    amount: "15.00",
    paymentChannel: "MPESA_C2B",
    status: "PAID",
    paymentTime: "2026-07-13T19:20:00.000Z",
    verifiedStatus: true,
    verifiedBy: null,
    verifiedAt: "2026-07-13T19:21:00.000Z"
  }
};

describe("payment receipts", () => {
  it("formats M-Pesa values as whole Kenyan shillings", () => {
    expect(formatReceiptAmount("15.00")).toBe("KES 15");
  });

  it("formats timestamps in Africa/Nairobi", () => {
    expect(formatReceiptDate("2026-07-13T19:20:00.000Z")).toContain("10:20");
  });

  it("escapes customer-controlled receipt content", () => {
    const markup = buildPaymentReceiptMarkup(receipt);
    expect(markup).toContain("Test &amp; Club");
    expect(markup).toContain("A &lt;Customer&gt;");
    expect(markup).not.toContain("A <Customer>");
    expect(markup).not.toContain("mverify-receipt__mark");
  });

  it("builds a WhatsApp-ready verified receipt message", () => {
    const text = buildPaymentReceiptShareText(receipt);
    expect(text).toContain("Test & Club\nM-PESA PAYMENT RECEIPT");
    expect(text).toContain("Amount received: KES 15");
    expect(text).toContain("M-Pesa code: TST123ABC");
    expect(decodeURIComponent(buildWhatsAppReceiptUrl(receipt))).toContain(text);
  });
});
