package ke.co.mverify.mobile;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

@CapacitorPlugin(name = "ReceiptShare")
public class ReceiptSharePlugin extends Plugin {
    @PluginMethod
    public void shareWhatsApp(PluginCall call) {
        String base64 = call.getString("base64");
        String requestedName = call.getString("fileName", "M-Verify-Receipt.pdf");
        String message = call.getString("message", "Verified M-Pesa payment receipt");
        if (base64 == null || base64.isBlank()) {
            call.reject("Receipt PDF data is required");
            return;
        }
        if (getActivity() == null) {
            call.reject("WhatsApp is unavailable while the app is in the background");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                String fileName = requestedName.replaceAll("[^A-Za-z0-9._-]", "-");
                if (!fileName.toLowerCase().endsWith(".pdf")) {
                    fileName += ".pdf";
                }

                File receiptDirectory = new File(getContext().getCacheDir(), "receipts");
                if (!receiptDirectory.exists() && !receiptDirectory.mkdirs()) {
                    throw new IllegalStateException("Could not prepare receipt storage");
                }
                File receiptFile = new File(receiptDirectory, fileName);
                try (FileOutputStream output = new FileOutputStream(receiptFile)) {
                    output.write(Base64.decode(base64, Base64.DEFAULT));
                }

                Uri receiptUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    receiptFile
                );
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("application/pdf");
                intent.putExtra(Intent.EXTRA_STREAM, receiptUri);
                intent.putExtra(Intent.EXTRA_TEXT, message);
                intent.setClipData(ClipData.newRawUri(fileName, receiptUri));
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().startActivity(Intent.createChooser(intent, "Send receipt PDF with WhatsApp"));
                JSObject result = new JSObject();
                result.put("started", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("WhatsApp could not be opened", error);
            }
        });
    }
}
