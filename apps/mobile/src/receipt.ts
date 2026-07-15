import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  buildPaymentReceiptHtml,
  buildPaymentReceiptPdf,
  buildPaymentReceiptShareText,
  buildWhatsAppReceiptUrl,
  downloadPaymentReceiptPdf,
  paymentReceiptPdfFileName,
  sharePaymentReceiptPdf,
  type PaymentReceipt
} from "@m-verify/shared";

type ReceiptPrinterPlugin = {
  print(options: { html: string; jobName: string }): Promise<{ started: boolean }>;
};

const ReceiptPrinter = registerPlugin<ReceiptPrinterPlugin>("ReceiptPrinter");

type ReceiptSharePlugin = {
  shareWhatsApp(options: { base64: string; fileName: string; message: string }): Promise<{ started: boolean }>;
};

const ReceiptShare = registerPlugin<ReceiptSharePlugin>("ReceiptShare");

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function printPaymentReceipt(receipt: PaymentReceipt): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    await ReceiptPrinter.print({
      html: buildPaymentReceiptHtml(receipt),
      jobName: `${receipt.receiptNumber} - M-Verify`
    });
    return;
  }

  window.print();
}

export async function sharePaymentReceiptOnWhatsApp(receipt: PaymentReceipt): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    const pdf = await buildPaymentReceiptPdf(receipt);
    await ReceiptShare.shareWhatsApp({
      base64: bytesToBase64(pdf),
      fileName: paymentReceiptPdfFileName(receipt),
      message: buildPaymentReceiptShareText(receipt)
    });
    return;
  }

  try {
    if (await sharePaymentReceiptPdf(receipt)) return;
  } catch (shareError) {
    if (shareError instanceof DOMException && shareError.name === "AbortError") return;
  }
  await downloadPaymentReceiptPdf(receipt);
  const url = buildWhatsAppReceiptUrl(receipt);
  const opened = window.open(url, "_blank");
  if (!opened) throw new Error("Receipt PDF was downloaded, but WhatsApp could not be opened");
  opened.opener = null;
}
