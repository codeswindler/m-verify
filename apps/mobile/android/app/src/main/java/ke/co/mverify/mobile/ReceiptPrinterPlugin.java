package ke.co.mverify.mobile;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ReceiptPrinter")
public class ReceiptPrinterPlugin extends Plugin {
    private WebView printWebView;

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        String jobName = call.getString("jobName", "M-Verify receipt");
        if (html == null || html.trim().isEmpty()) {
            call.reject("Receipt content is required");
            return;
        }
        if (getActivity() == null) {
            call.reject("Printing is unavailable while the app is in the background");
            return;
        }

        getActivity().runOnUiThread(() -> {
            WebView webView = new WebView(getContext());
            printWebView = webView;
            webView.getSettings().setJavaScriptEnabled(false);
            webView.setWebViewClient(new WebViewClient() {
                private boolean started;

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    return false;
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (started) return;
                    started = true;

                    PrintManager printManager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                    if (printManager == null) {
                        printWebView = null;
                        call.reject("Android printing service is unavailable");
                        return;
                    }

                    PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                    PrintAttributes attributes = new PrintAttributes.Builder()
                        .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                        .build();
                    printManager.print(jobName, adapter, attributes);
                    printWebView = null;

                    JSObject result = new JSObject();
                    result.put("started", true);
                    call.resolve(result);
                }
            });
            webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
}
