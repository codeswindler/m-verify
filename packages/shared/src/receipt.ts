import type { PaymentReceipt } from "./index.js";
import type { Color, PDFFont, PDFPage } from "pdf-lib";

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

const pointsPerMillimeter = 72 / 25.4;

function wrapPdfText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
      const segments: string[] = [];
      let segment = "";
      for (const character of word) {
        if (segment && font.widthOfTextAtSize(`${segment}${character}`, size) > maxWidth) {
          segments.push(segment);
          segment = character;
        } else {
          segment += character;
        }
      }
      if (segment) segments.push(segment);
      return segments;
    });
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let line = words[0] ?? "";
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

function drawCenteredLines(
  page: PDFPage,
  lines: string[],
  font: PDFFont,
  size: number,
  y: number,
  color: Color,
  lineHeight = size + 3
): number {
  const width = page.getWidth();
  for (const line of lines) {
    const textWidth = font.widthOfTextAtSize(line, size);
    page.drawText(line, { x: Math.max(18, (width - textWidth) / 2), y, size, font, color });
    y -= lineHeight;
  }
  return y;
}

function drawReceiptDivider(page: PDFPage, y: number, color: Color): void {
  page.drawLine({
    start: { x: 18, y },
    end: { x: page.getWidth() - 18, y },
    thickness: 0.65,
    color,
    dashArray: [3, 3]
  });
}

function drawReceiptRow(
  page: PDFPage,
  label: string,
  value: string,
  regular: PDFFont,
  bold: PDFFont,
  y: number,
  mutedColor: Color,
  textColor: Color
): number {
  const right = page.getWidth() - 18;
  const valueLines = wrapPdfText(value || "-", bold, 8.4, 116).slice(0, 3);
  page.drawText(label, { x: 18, y, size: 8, font: regular, color: mutedColor });
  valueLines.forEach((line, index) => {
    const lineWidth = bold.widthOfTextAtSize(line, 8.4);
    page.drawText(line, {
      x: right - lineWidth,
      y: y - index * 10,
      size: 8.4,
      font: bold,
      color: textColor
    });
  });
  return y - Math.max(14, valueLines.length * 10 + 4);
}

export function paymentReceiptPdfFileName(receipt: PaymentReceipt): string {
  const safeNumber = receipt.receiptNumber.replace(/[^A-Za-z0-9_-]+/g, "-");
  return `${safeNumber || "M-Verify-Receipt"}.pdf`;
}

export async function buildPaymentReceiptPdf(receipt: PaymentReceipt): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const width = 80 * pointsPerMillimeter;
  const height = 155 * pointsPerMillimeter;
  const page = document.addPage([width, height]);
  const payment = receipt.payment;
  const customer = payment.customerName || "M-Pesa customer";
  const verifier = payment.verifiedBy?.fullName || payment.verifiedBy?.username || "Authorized staff";
  const dividerColor = rgb(0.52, 0.63, 0.57);
  const mutedColor = rgb(0.28, 0.38, 0.32);
  const textColor = rgb(0.03, 0.1, 0.06);

  document.setTitle(`${receipt.receiptNumber} - ${receipt.businessName}`);
  document.setAuthor("M-Verify");
  document.setSubject("Verified M-Pesa payment receipt");
  document.setCreator("M-Verify");

  let y = height - 27;
  const businessLines = wrapPdfText(receipt.businessName, bold, 16, width - 36).slice(0, 2);
  y = drawCenteredLines(page, businessLines, bold, 16, y, rgb(0.03, 0.28, 0.15), 18);
  y = drawCenteredLines(page, ["M-PESA PAYMENT RECEIPT"], bold, 7.8, y - 1, rgb(0.27, 0.38, 0.31), 11);
  drawReceiptDivider(page, y - 2, dividerColor);
  y -= 17;

  y = drawReceiptRow(page, "Receipt", receipt.receiptNumber, regular, bold, y, mutedColor, textColor);
  y = drawReceiptRow(page, "Issued", formatReceiptDate(receipt.issuedAt), regular, bold, y, mutedColor, textColor);
  drawReceiptDivider(page, y + 3, dividerColor);

  y -= 16;
  y = drawCenteredLines(page, ["AMOUNT RECEIVED"], regular, 7.5, y, rgb(0.32, 0.42, 0.36), 12);
  y -= 10;
  y = drawCenteredLines(page, [formatReceiptAmount(payment.amount)], bold, 22, y, rgb(0.02, 0.16, 0.08), 27);
  drawReceiptDivider(page, y + 7, dividerColor);
  y -= 8;

  const details: Array<[string, string]> = [
    ["Customer", customer],
    ["Phone / payer ID", payment.phoneNumber],
    ["M-Pesa code", payment.transactionCode],
    ["Reference", payment.reference || "-"],
    ["Payment channel", payment.paymentChannel],
    ["Received", formatReceiptDate(payment.paymentTime)],
    ["Verified by", verifier],
    ["Verified at", formatReceiptDate(payment.verifiedAt)]
  ];
  for (const [label, value] of details) {
    y = drawReceiptRow(page, label, value, regular, bold, y, mutedColor, textColor);
  }
  drawReceiptDivider(page, y + 4, dividerColor);

  const verifiedHeight = 27;
  y -= verifiedHeight - 3;
  page.drawRectangle({
    x: 18,
    y,
    width: width - 36,
    height: verifiedHeight,
    borderWidth: 0.8,
    borderColor: rgb(0.38, 0.72, 0.52),
    color: rgb(0.93, 0.98, 0.95)
  });
  const verifiedText = "PAYMENT VERIFIED";
  const verifiedWidth = bold.widthOfTextAtSize(verifiedText, 9);
  page.drawText(verifiedText, {
    x: (width - verifiedWidth) / 2,
    y: y + 9,
    size: 9,
    font: bold,
    color: rgb(0.03, 0.45, 0.22)
  });

  y -= 17;
  const footerLines = wrapPdfText(
    "This receipt confirms that the M-Pesa payment above was received and verified. It does not itemise goods or services.",
    regular,
    6.7,
    width - 46
  );
  y = drawCenteredLines(page, footerLines, regular, 6.7, y, rgb(0.31, 0.4, 0.35), 9);
  drawCenteredLines(page, ["Verified with M-Verify"], bold, 7, y - 3, rgb(0.14, 0.26, 0.19), 9);

  return document.save();
}

export async function createPaymentReceiptPdfFile(receipt: PaymentReceipt): Promise<File> {
  const bytes = await buildPaymentReceiptPdf(receipt);
  const buffer = new Uint8Array(bytes).buffer;
  return new File([buffer], paymentReceiptPdfFileName(receipt), { type: "application/pdf" });
}

export async function downloadPaymentReceiptPdf(receipt: PaymentReceipt): Promise<void> {
  const file = await createPaymentReceiptPdfFile(receipt);
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function sharePaymentReceiptPdf(receipt: PaymentReceipt): Promise<boolean> {
  if (typeof navigator.share !== "function") return false;
  const file = await createPaymentReceiptPdfFile(receipt);
  const data: ShareData = {
    files: [file],
    title: `${receipt.businessName} payment receipt`,
    text: `Verified M-Pesa receipt ${receipt.receiptNumber}`
  };
  if (typeof navigator.canShare === "function" && !navigator.canShare(data)) return false;
  await navigator.share(data);
  return true;
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
