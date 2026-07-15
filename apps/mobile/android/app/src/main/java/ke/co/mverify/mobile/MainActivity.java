package ke.co.mverify.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReceiptPrinterPlugin.class);
        registerPlugin(ReceiptSharePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
