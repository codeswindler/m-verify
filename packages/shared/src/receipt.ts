import type { PaymentReceipt } from "./index.js";

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatReceiptAmount(value: string | number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "KES 0";
  return `KES ${Math.round(numeric).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

export function formatReceiptDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Nairobi"
  }).format(date);
}

export const paymentReceiptStyles = `
  .mverify-receipt {
    width: 100%; max-width: 80mm; margin: 0 auto; box-sizing: border-box;
    background: #fff; color: #101914; border: 1px solid #d8e2dc;
    padding: 8mm 7mm; font-family: Arial, Helvetica, sans-serif; font-size: 11px;
    line-height: 1.45;
  }
  .mverify-receipt * { box-sizing: border-box; }
  .mverify-receipt__brand { text-align: center; padding-bottom: 14px; border-bottom: 1px dashed #8ba094; }
  .mverify-receipt h1 { margin: 0; font-size: 21px; line-height: 1.2; color: #0b351f; }
  .mverify-receipt__title { margin: 6px 0 0; color: #4c6256; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .mverify-receipt__meta { display: grid; gap: 4px; padding: 13px 0; border-bottom: 1px dashed #8ba094; }
  .mverify-receipt__row { display: flex; justify-content: space-between; gap: 14px; align-items: start; }
  .mverify-receipt__row span:first-child { color: #52675b; }
  .mverify-receipt__row strong { max-width: 62%; text-align: right; overflow-wrap: anywhere; }
  .mverify-receipt__amount { padding: 17px 0; text-align: center; border-bottom: 1px dashed #8ba094; }
  .mverify-receipt__amount span { display: block; color: #52675b; font-size: 10px; text-transform: uppercase; }
  .mverify-receipt__amount strong { display: block; margin-top: 3px; color: #061f12; font-size: 25px; line-height: 1.1; }
  .mverify-receipt__details { display: grid; gap: 7px; padding: 14px 0; border-bottom: 1px dashed #8ba094; }
  .mverify-receipt__verified {
    display: flex; align-items: center; justify-content: center; gap: 7px; margin: 14px 0;
    padding: 9px; border: 1px solid #87cba8; background: #edf9f2; color: #08733e; font-weight: 900;
  }
  .mverify-receipt__footer { color: #52675b; text-align: center; font-size: 9px; }
  .mverify-receipt__footer strong { display: block; margin-top: 9px; color: #233a2d; }
  @page { margin: 8mm; }
  @media print {
    .mverify-receipt { max-width: 80mm; border: 0; padding: 0; }
  }
`;

export function buildPaymentReceiptMarkup(receipt: PaymentReceipt): string {
  const payment = receipt.payment;
  const customer = payment.customerName || "M-Pesa customer";
  const verifier = payment.verifiedBy?.fullName || payment.verifiedBy?.username || "Authorized staff";

  return `
    <article class="mverify-receipt" aria-label="M-Pesa payment receipt">
      <header class="mverify-receipt__brand">
        <h1>${escapeHtml(receipt.businessName)}</h1>
        <p class="mverify-receipt__title">M-Pesa payment receipt</p>
      </header>
      <section class="mverify-receipt__meta">
        <div class="mverify-receipt__row"><span>Receipt</span><strong>${escapeHtml(receipt.receiptNumber)}</strong></div>
        <div class="mverify-receipt__row"><span>Issued</span><strong>${escapeHtml(formatReceiptDate(receipt.issuedAt))}</strong></div>
      </section>
      <section class="mverify-receipt__amount">
        <span>Amount received</span>
        <strong>${escapeHtml(formatReceiptAmount(payment.amount))}</strong>
      </section>
      <section class="mverify-receipt__details">
        <div class="mverify-receipt__row"><span>Customer</span><strong>${escapeHtml(customer)}</strong></div>
        <div class="mverify-receipt__row"><span>Phone / payer ID</span><strong>${escapeHtml(payment.phoneNumber)}</strong></div>
        <div class="mverify-receipt__row"><span>M-Pesa code</span><strong>${escapeHtml(payment.transactionCode)}</strong></div>
        <div class="mverify-receipt__row"><span>Reference</span><strong>${escapeHtml(payment.reference || "-")}</strong></div>
        <div class="mverify-receipt__row"><span>Payment channel</span><strong>${escapeHtml(payment.paymentChannel)}</strong></div>
        <div class="mverify-receipt__row"><span>Received</span><strong>${escapeHtml(formatReceiptDate(payment.paymentTime))}</strong></div>
        <div class="mverify-receipt__row"><span>Verified by</span><strong>${escapeHtml(verifier)}</strong></div>
        <div class="mverify-receipt__row"><span>Verified at</span><strong>${escapeHtml(formatReceiptDate(payment.verifiedAt))}</strong></div>
      </section>
      <div class="mverify-receipt__verified"><span>&#10003;</span> PAYMENT VERIFIED</div>
      <footer class="mverify-receipt__footer">
        This receipt confirms that the M-Pesa payment above was received and verified. It does not itemise goods or services.
        <strong>Verified with M-Verify</strong>
      </footer>
    </article>
  `;
}

export function buildPaymentReceiptShareText(receipt: PaymentReceipt): string {
  const payment = receipt.payment;
  const customer = payment.customerName || "M-Pesa customer";
  const verifier = payment.verifiedBy?.fullName || payment.verifiedBy?.username || "Authorized staff";

  return [
    receipt.businessName,
    "M-PESA PAYMENT RECEIPT",
    "",
    `Receipt: ${receipt.receiptNumber}`,
    `Amount received: ${formatReceiptAmount(payment.amount)}`,
    `Customer: ${customer}`,
    `Phone / payer ID: ${payment.phoneNumber}`,
    `M-Pesa code: ${payment.transactionCode}`,
    `Reference: ${payment.reference || "-"}`,
    `Received: ${formatReceiptDate(payment.paymentTime)}`,
    `Verified by: ${verifier}`,
    `Verified at: ${formatReceiptDate(payment.verifiedAt)}`,
    "",
    "PAYMENT VERIFIED",
    "Verified with M-Verify"
  ].join("\n");
}

export function buildWhatsAppReceiptUrl(receipt: PaymentReceipt): string {
  return `https://wa.me/?text=${encodeURIComponent(buildPaymentReceiptShareText(receipt))}`;
}

export function buildPaymentReceiptHtml(receipt: PaymentReceipt): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(receipt.receiptNumber)} - M-Verify</title>
    <style>
      html, body { margin: 0; padding: 0; background: #fff; color: #101914; }
      body { padding: 8mm; }
      ${paymentReceiptStyles}
    </style>
  </head>
  <body>${buildPaymentReceiptMarkup(receipt)}</body>
</html>`;
}
