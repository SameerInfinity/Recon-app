package com.recon.buildmanager;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the custom CallLog plugin before calling super.onCreate()
        // so Capacitor knows about it when the bridge initializes.
        registerPlugin(CallLogPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
