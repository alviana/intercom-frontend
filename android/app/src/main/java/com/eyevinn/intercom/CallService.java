package com.eyevinn.intercom;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

public class CallService extends Service {
    public static final String CHANNEL_ID = "intercom_call_channel";
    public static final int NOTIF_ID = 2;
    public static volatile boolean running = false;

    private Notification notification;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        ensureChannel();
        // PendingIntents for notification actions
        int flags = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                ? (android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE)
                : android.app.PendingIntent.FLAG_UPDATE_CURRENT;

        android.content.Intent openIntent = new android.content.Intent(this, MainActivity.class);
        openIntent.setAction("com.eyevinn.intercom.OPEN");
        openIntent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
        android.app.PendingIntent openPI = android.app.PendingIntent.getActivity(this, 2001, openIntent, flags);

        android.content.Intent exitIntent = new android.content.Intent(this, MainActivity.class);
        exitIntent.setAction("com.eyevinn.intercom.EXIT");
        exitIntent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
        android.app.PendingIntent exitPI = android.app.PendingIntent.getActivity(this, 2002, exitIntent, flags);

        notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Intercom ac24horas ativo")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setContentIntent(openPI)
                .addAction(0, "Abrir", openPI)
                .addAction(0, "Sair", exitPI)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();

        // Keep CPU and Wi-Fi awake while the screen is off so WebRTC audio keeps flowing.
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "intercom:call");
        wakeLock.acquire();
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null) {
            int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                    : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = wm.createWifiLock(mode, "intercom:call");
            wifiLock.acquire();
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundWithTypes();
        return START_NOT_STICKY;
    }

    // Runs on every start(): Android 14+ throws if the microphone type is requested before
    // RECORD_AUDIO is granted, so it is added once the permission exists (JS calls start() again on join).
    private void startForegroundWithTypes() {
        int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED) {
            type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        }
        ServiceCompat.startForeground(this, NOTIF_ID, notification, type);
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        AudioRoutePlugin.releaseAppAudioRouting(this);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        AudioRoutePlugin.releaseAppAudioRouting(this);
        running = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopFgCompat();
        }
    }

    @SuppressWarnings("deprecation")
    private void stopFgCompat() {
        stopForeground(true);
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "Linhas do intercom",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }
}
