package io.github.dehaka0508.pokeleague;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The game is laid out in fixed pixel sizes: keep text at 100% (as in the browser) instead of
        // following the phone's font size setting, which would break the screens.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setTextZoom(100);
        }
    }
}
