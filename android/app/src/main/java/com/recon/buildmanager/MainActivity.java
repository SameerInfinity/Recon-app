package com.recon.buildmanager;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register the custom CallLog plugin before calling super.onCreate()
        // so Capacitor knows about it when the bridge initializes.
        registerPlugin(CallLogPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Required marker method — presence confirms the activity has been
        // modified per @capgo/capacitor-social-login docs.
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        // Forward Google authorization results (scope consent screen) back
        // to the SocialLoginPlugin so it can complete the sign-in flow.
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
                && requestCode <= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            SocialLoginPlugin plugin = (SocialLoginPlugin) bridge.getPlugin("SocialLogin").getInstance();
            if (plugin != null) {
                plugin.handleGoogleLoginIntent(requestCode, data);
            }
        }
    }
}
