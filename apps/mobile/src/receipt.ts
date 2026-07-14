import { Capacitor, registerPlugin } from "@capacitor/core";
import { buildPaymentReceiptHtml, type PaymentReceipt } from "@m-verify/shared";

type ReceiptPrinterPlugin = {
  print(options: { html: string; jobName: string }): Promise<{ started: boolean }>;
};

const ReceiptPrinter = registerPlugin<ReceiptPrinterPlugin>("ReceiptPrinter");

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
