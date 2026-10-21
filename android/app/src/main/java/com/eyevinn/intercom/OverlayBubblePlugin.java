package com.eyevinn.intercom;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OverlayBubble")
public class OverlayBubblePlugin extends Plugin {
    private BroadcastReceiver receiver;

    @Override
    public void load() {
        IntentFilter filter = new IntentFilter(OverlayService.ACTION);
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getStringExtra("action");
                JSObject payload = new JSObject();
                payload.put("action", action);
                try { payload.put("index", intent.getIntExtra("index", -1)); } catch (Exception ignored) {}
                notifyListeners("bubbleAction", payload);
            }
        };
        // Android 14+ throws (and the whole plugin fails to load) unless the export flag is set.
        ContextCompat.registerReceiver(getContext(), receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        try { if (receiver != null) getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
    }

    @PluginMethod
    public void canDrawOverlays(PluginCall call) {
        boolean granted = Settings.canDrawOverlays(getContext());
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void openOverlayPermission(PluginCall call) {
        try {
            if (!Settings.canDrawOverlays(getContext())) {
                // Try app-specific overlay permission screen
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(intent);
            }
        } catch (Exception ignored) {}
        try {
            // Fallback to general overlay settings if needed
            Intent general = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
            general.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(general);
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) {
            call.reject("Overlay permission not granted");
            return;
        }
        Context ctx = getContext();
        Intent svc = new Intent(ctx, OverlayService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(svc);
        } else {
            ctx.startService(svc);
        }
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        Context ctx = getContext();
        Intent svc = new Intent(ctx, OverlayService.class);
        ctx.stopService(svc);
        call.resolve();
    }

    @PluginMethod
    public void setCallRows(PluginCall call) {
        try {
            int count = call.getInt("count", 0);
            com.getcapacitor.JSArray latchArr = call.getArray("latch");
            com.getcapacitor.JSArray listenArr = call.getArray("listen");
            com.getcapacitor.JSArray allowedArr = call.getArray("micAllowed");
            com.getcapacitor.JSArray listenAllowedArr = call.getArray("listenAllowed");
            com.getcapacitor.JSArray labelsArr = call.getArray("labels");
            com.getcapacitor.JSArray activityArr = call.getArray("activity");
            boolean[] latch = new boolean[count];
            boolean[] listen = new boolean[count];
            boolean[] allowed = new boolean[count];
            boolean[] listenAllowed = new boolean[count];
            boolean[] activity = new boolean[count];
            String[] labels = new String[count];
            for (int i = 0; i < count; i++) {
                try { latch[i] = latchArr != null && Boolean.TRUE.equals(latchArr.getBoolean(i)); } catch (Exception e) { latch[i] = false; }
                try { listen[i] = listenArr != null && Boolean.TRUE.equals(listenArr.getBoolean(i)); } catch (Exception e) { listen[i] = true; }
                try { allowed[i] = allowedArr != null && Boolean.TRUE.equals(allowedArr.getBoolean(i)); } catch (Exception e) { allowed[i] = true; }
                try { listenAllowed[i] = listenAllowedArr != null && Boolean.TRUE.equals(listenAllowedArr.getBoolean(i)); } catch (Exception e) { listenAllowed[i] = true; }
                try { activity[i] = activityArr != null && Boolean.TRUE.equals(activityArr.getBoolean(i)); } catch (Exception e) { activity[i] = false; }
                try {
                    labels[i] = labelsArr != null ? labelsArr.getString(i) : null;
                } catch (Exception e) {
                    labels[i] = null;
                }
                if (labels[i] == null || labels[i].trim().isEmpty()) {
                    labels[i] = "Linha " + (i + 1);
                }
            }
            Intent intent = new Intent("com.eyevinn.intercom.BUBBLE_UPDATE");
            intent.putExtra("count", count);
            intent.putExtra("latch", latch);
            intent.putExtra("listen", listen);
            intent.putExtra("allowed", allowed);
            intent.putExtra("listenAllowed", listenAllowed);
            intent.putExtra("labels", labels);
            intent.putExtra("activity", activity);
            intent.setPackage(getContext().getPackageName());
            getContext().sendBroadcast(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to set rows: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", OverlayService.isRunning);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(getActivity(), new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
            }
        }
        call.resolve();
    }
}
