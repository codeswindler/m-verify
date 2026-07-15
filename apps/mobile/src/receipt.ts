import { Capacitor, registerPlugin } from "@capacitor/core";
import { buildPaymentReceiptHtml, buildWhatsAppReceiptUrl, type PaymentReceipt } from "@m-verify/shared";

type ReceiptPrinterPlugin = {
  print(options: { html: string; jobName: string }): Promise<{ started: boolean }>;
};

const ReceiptPrinter = registerPlugin<ReceiptPrinterPlugin>("ReceiptPrinter");

type ReceiptSharePlugin = {
  shareWhatsApp(options: { url: string }): Promise<{ started: boolean }>;
};

const ReceiptShare = registerPlugin<ReceiptSharePlugin>("ReceiptShare");

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
  const url = buildWhatsAppReceiptUrl(receipt);
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    await ReceiptShare.shareWhatsApp({ url });
    return;
  }

  const opened = window.open(url, "_blank");
  if (!opened) throw new Error("WhatsApp could not be opened");
  opened.opener = null;
}
