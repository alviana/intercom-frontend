package com.eyevinn.intercom;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CallService")
public class CallServicePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Context ctx = getContext();
        Intent svc = new Intent(ctx, CallService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(svc);
        } else {
            ctx.startService(svc);
        }
        askBatteryOptimizationExemptionOnce(ctx);
        JSObject ret = new JSObject();
        ret.put("running", true);
        call.resolve(ret);
    }

    // Doze/battery savers kill the call with the screen off; ask the user once to exempt the app.
    private void askBatteryOptimizationExemptionOnce(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || getActivity() == null) return;
        // Wait until the mic is granted (first call) so this doesn't collide with the startup permission prompts.
        if (ActivityCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        android.content.SharedPreferences prefs = ctx.getSharedPreferences("intercom", Context.MODE_PRIVATE);
        android.os.PowerManager pm = (android.os.PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (prefs.getBoolean("askedBatteryOpt", false) || pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) return;
        prefs.edit().putBoolean("askedBatteryOpt", true).apply();
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(android.net.Uri.parse("package:" + ctx.getPackageName()));
            getActivity().startActivity(i);
        } catch (android.content.ActivityNotFoundException ignored) {
            // Some OEM builds lack this screen; the user can still exempt the app in system settings.
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        Intent svc = new Intent(ctx, CallService.class);
        ctx.stopService(svc);
        JSObject ret = new JSObject();
        ret.put("running", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void setSessions(PluginCall call) {
        java.util.List<String> ids = new java.util.ArrayList<>();
        JSArray arr = call.getArray("sessionIds");
        try {
            if (arr != null) ids = arr.toList();
        } catch (org.json.JSONException ignored) {
            // keep the empty list
        }
        CallService.setSessions(call.getString("baseUrl"), call.getString("apiKey"), ids);
        call.resolve();
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", CallService.running);
        call.resolve(ret);
    }

    @PluginMethod
    public void hasNotificationPermission(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= 33) {
            granted = ActivityCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void hasRecordAudioPermission(PluginCall call) {
        boolean granted = ActivityCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1002);
            }
        }
        call.resolve();
    }
}
