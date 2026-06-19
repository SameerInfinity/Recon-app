# Native Google Sign-In on Android — Setup Guide

This replaces the old behavior (tapping "Continue with Google" opened a
browser and finished the login on the website) with the native Google
account picker that stays inside the app.

## What changed in the code

- `package.json` — added `@capgo/capacitor-social-login`.
- `server.js` — `/api/config` now also returns `googleWebClientId`, read
  from a new `GOOGLE_WEB_CLIENT_ID` env var.
- `.env.example` — documents `GOOGLE_WEB_CLIENT_ID`.
- `public/js/supabase-client.js` — `signInWithGoogle()` now detects
  Capacitor and, when running natively, calls the `SocialLogin` plugin to
  open Google's native picker, validates the returned ID token, and signs
  into Supabase with `signInWithIdToken()`. On the web it still uses the
  original browser redirect flow — nothing changes there.
- `public/auth.html` — `handleGoogle()` now explicitly redirects to `/`
  after a successful native sign-in (the web flow is untouched).

## What you still need to do (one-time, on your machine)

### 1. Add `GOOGLE_WEB_CLIENT_ID` to your `.env`

This is the **same** "Web application" OAuth client ID you already gave to
Supabase under Authentication → Providers → Google. Add it to your local
`.env` (and to whatever environment your deployed server reads `.env`
from):

```
GOOGLE_WEB_CLIENT_ID=your-existing-web-client-id.apps.googleusercontent.com
```

### 2. Add the Android client ID to Supabase

In Supabase Dashboard → Authentication → Providers → Google → **Authorized
Client IDs**, add your new Android client ID alongside the existing Web
client ID, comma-separated, **with the Web client ID listed first**:

```
your-web-client-id.apps.googleusercontent.com,your-android-client-id.apps.googleusercontent.com
```

Leave "Client Secret (for OAuth)" and "Callback URL (for OAuth)" empty —
those are only for the browser-redirect flow the web version still uses.

### 3. Create an Android OAuth client in Google Cloud Console

This is required even though the app's JS never references it directly —
it's what tells Google "this signed APK is allowed to use this project's
Google Sign-In."

1. Google Cloud Console → APIs & Services → Credentials → Create
   Credentials → OAuth client ID → Application type: **Android**.
2. Package name: `com.recon.buildmanager` (matches `capacitor.config.json`).
3. SHA-1 certificate fingerprint: get it by running, in a terminal:
   ```
   keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android
   ```
   (Use your real release keystore + alias/password for production builds,
   or grab the SHA-1 from Play Console → Setup → App integrity if you use
   Play App Signing.)
4. Click Create. You don't need to copy this client ID anywhere in the
   code — it just needs to exist, registered against that SHA-1.

### 4. Install the plugin and sync

```
npm install
npx cap sync android
```

If you don't have an `android/` folder yet, run `npx cap add android`
first.

### 5. Edit `android/app/src/main/java/.../MainActivity.java`

Replace its contents with the following (this wiring is required by the
`@capgo/capacitor-social-login` plugin to receive Google's sign-in result):

```java
package com.recon.buildmanager;

import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.Plugin;
import android.content.Intent;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

// ModifiedMainActivityForSocialLoginPlugin is required by the plugin — do not remove.
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

  @Override
  public void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);

    if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
      PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
      if (pluginHandle == null) {
        Log.i("Google Activity Result", "SocialLogin login handle is null");
        return;
      }
      Plugin plugin = pluginHandle.getInstance();
      if (!(plugin instanceof SocialLoginPlugin)) {
        Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
        return;
      }
      ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
    }
  }

  // Never actually called — required to exist by the plugin's interface.
  @Override
  public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
```

> If your existing `MainActivity.java` has other custom code (other
> plugins, other overrides), merge this in rather than replacing the whole
> file — keep your existing imports/overrides and just add the
> `implements ModifiedMainActivityForSocialLoginPlugin`, the
> `onActivityResult` override above, and the empty interface method.

### 6. Test with an emulator that has Play Store

Native Google Sign-In needs Google Play Services. In Android Studio's
Device Manager, create a virtual device using a system image with the
**Google Play** label (not just "Google APIs"), boot it, then open
Settings → Google Play on the emulator once and let it update — first run
can take ~60 seconds.

### 7. Build and test

```
npx cap run android
```

Tap "Continue with Google" — you should see the native account picker
bottom sheet appear directly in the app, with no browser tab and no
redirect back to the website.

## Troubleshooting

- **"SocialLogin native plugin not available"** — you haven't run
  `npx cap sync android` since installing the plugin, or you're testing in
  a plain browser tab instead of the built Android app.
- **Nonce mismatch / invalid token errors** — the code already retries
  once automatically (this is a known Android/iOS native-SDK token-caching
  quirk). If it persists, double check the Android OAuth client's package
  name and SHA-1 exactly match your build.
- **Invalid audience** — your `GOOGLE_WEB_CLIENT_ID` env var doesn't match
  the Web client ID configured in Supabase's Google provider. They must be
  identical.
- General Google sign-in issues on Android are almost always the SHA-1
  fingerprint — double-check it against the keystore actually signing the
  build you're testing.
