package ke.co.mverify.mobile;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ReceiptShare")
public class ReceiptSharePlugin extends Plugin {
    @PluginMethod
    public void shareWhatsApp(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://wa.me/")) {
            call.reject("A valid WhatsApp receipt link is required");
            return;
        }
        if (getActivity() == null) {
            call.reject("WhatsApp is unavailable while the app is in the background");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                getActivity().startActivity(Intent.createChooser(intent, "Send receipt with WhatsApp"));
                JSObject result = new JSObject();
                result.put("started", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("WhatsApp could not be opened", error);
            }
        });
    }
}
