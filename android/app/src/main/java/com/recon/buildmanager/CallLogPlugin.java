package com.recon.buildmanager;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.CallLog;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import androidx.core.content.ContextCompat;

/**
 * CallLogPlugin — Custom Capacitor plugin for RECON
 *
 * Provides native Android call log access with proper runtime permission handling.
 * When the user taps "Add Last Call", this plugin:
 *   1. Checks if READ_CALL_LOG permission is already granted
 *   2. If not, triggers the NATIVE Android permission dialog (the system popup)
 *   3. If granted, reads the last N call log entries
 *
 * The @CapacitorPlugin annotation with the permissions array tells Capacitor
 * to manage this permission declaratively, which is required for the
 * requestPermissionForAlias() flow to show the native system dialog.
 *
 * HOW THE NATIVE PERMISSION POPUP WORKS:
 * ─────────────────────────────────────
 * When JS calls requestPermission(), this plugin calls
 * requestPermissionForAlias("readCallLog", call, "permissionCallback").
 * Capacitor internally calls ActivityCompat.requestPermissions() on the
 * Activity, which triggers Android's system-level permission dialog:
 *
 *   ┌─────────────────────────────────────────┐
 *   │  🔒 Allow RECON to access your call log? │
 *   │                                         │
 *   │  RECON wants to access your call log    │
 *   │  to show recent calls.                  │
 *   │                                         │
 *   │   [Deny]              [Allow]           │
 *   └─────────────────────────────────────────┘
 *
 * This is the EXACT same dialog WhatsApp, Truecaller, etc. use.
 * The result comes back via the @PermissionCallback method.
 */
@CapacitorPlugin(
    name = "CallLog",
    permissions = {
        @Permission(
            alias = "readCallLog",
            strings = { Manifest.permission.READ_CALL_LOG }
        )
    }
)
public class CallLogPlugin extends Plugin {

    /**
     * Check if READ_CALL_LOG permission is currently granted.
     * Called from JS before attempting to request permission or read calls.
     */
    @PluginMethod
    public void checkPermission(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(getContext(),
            Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED;

        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    /**
     * Request READ_CALL_LOG permission — shows the NATIVE Android permission dialog.
     *
     * This is THE KEY METHOD the user was asking for. It triggers Android's
     * built-in permission request system — the same popup every other app uses.
     *
     * If already granted, resolves immediately with granted=true.
     * Otherwise, calls requestPermissionForAlias() which triggers the system dialog.
     * The result is delivered to the @PermissionCallback method below.
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        // Already granted? Resolve immediately.
        if (ContextCompat.checkSelfPermission(getContext(),
                Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        // This triggers the NATIVE Android permission dialog
        requestPermissionForAlias("readCallLog", call, "permissionCallback");
    }

    /**
     * Callback from the native permission dialog.
     * Called after the user taps "Allow" or "Deny" on the system dialog.
     */
    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(getContext(),
            Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED;

        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    /**
     * Read the most recent call log entries.
     * Requires READ_CALL_LOG permission to be already granted.
     *
     * Returns a JSON array of call objects with:
     *   - number: phone number (string)
     *   - name: cached contact name (string, empty if unknown)
     *   - date: timestamp in milliseconds (long)
     *   - duration: call duration in seconds (string)
     *   - type: call type integer (1=Incoming, 2=Outgoing, 3=Missed, 5=Rejected)
     */
    @PluginMethod
    public void getRecentCalls(PluginCall call) {
        // Guard: permission must be granted first
        if (ContextCompat.checkSelfPermission(getContext(),
                Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
            call.reject("READ_CALL_LOG permission not granted. Call requestPermission() first.");
            return;
        }

        int limit = call.getInt("limit", 5);
        JSArray calls = new JSArray();

        // Query the Android CallLog ContentProvider
        String[] projection = {
            CallLog.Calls.NUMBER,
            CallLog.Calls.CACHED_NAME,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
            CallLog.Calls.TYPE
        };

        try (Cursor cursor = getContext().getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                projection,
                null,
                null,
                CallLog.Calls.DATE + " DESC"
        )) {
            if (cursor != null) {
                int count = 0;
                while (cursor.moveToNext() && count < limit) {
                    JSObject callEntry = new JSObject();
                    String number = cursor.getString(0);
                    String name = cursor.getString(1);
                    long date = cursor.getLong(2);
                    String duration = cursor.getString(3);
                    int type = cursor.getInt(4);

                    callEntry.put("number", number != null ? number : "");
                    callEntry.put("name", name != null ? name : "");
                    callEntry.put("date", date);
                    callEntry.put("duration", duration != null ? duration : "0");
                    callEntry.put("type", type);
                    calls.put(callEntry);
                    count++;
                }
            }
        } catch (SecurityException e) {
            call.reject("Security exception: " + e.getMessage());
            return;
        } catch (Exception e) {
            call.reject("Failed to read call log: " + e.getMessage());
            return;
        }

        JSObject result = new JSObject();
        result.put("calls", calls);
        call.resolve(result);
    }

    /**
     * Open the Android system settings page for this app.
     * This is needed when the user previously denied permission with
     * "Don't ask again" — the native dialog won't show again, so
     * the user must manually enable the permission in Settings.
     *
     * Opens: Settings > Apps > RECON > Permissions
     */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to open app settings: " + e.getMessage());
        }
    }
}
