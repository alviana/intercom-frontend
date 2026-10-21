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
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.KeyEvent;
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
    private java.util.concurrent.ScheduledExecutorService heartbeats;

    // Sessions the app is in. They are heartbeated from here because with the screen
    // off the WebView's timers are throttled and the JS heartbeat stops reaching the
    // server, which then drops the user from the participant list (see CallServiceManager.tsx).
    private static final java.util.Set<String> sessionIds =
            java.util.Collections.newSetFromMap(new java.util.concurrent.ConcurrentHashMap<String, Boolean>());
    private static volatile String apiBaseUrl;
    private static volatile String apiKey;
    private static volatile CallService instance;
    private MediaSession mediaSession;

    static void setSessions(String baseUrl, String key, java.util.List<String> ids) {
        apiBaseUrl = baseUrl;
        apiKey = key;
        sessionIds.retainAll(ids);
        sessionIds.addAll(ids);
        final CallService svc = instance;
        if (svc != null) new Handler(Looper.getMainLooper()).post(svc::applySessionActive);
    }

    // The session is active only while the app is in a session, so with no call open
    // Spotify/YouTube keep their play/pause button.
    private void applySessionActive() {
        if (mediaSession != null) mediaSession.setActive(!sessionIds.isEmpty());
    }

    // Hold-to-talk is impossible here: AOSP MediaSessionService treats HEADSETHOOK and
    // MEDIA_PLAY_PAUSE as "voice keys", holding the DOWN until release; a long press launches
    // the voice assistant instead of reaching the app. So only discrete presses are delivered.
    @SuppressWarnings("deprecation")
    private void createMediaSession() {
        mediaSession = new MediaSession(this, "intercom-headset");
        mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE)
                .setState(PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build());
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public boolean onMediaButtonEvent(Intent mediaButtonIntent) {
                KeyEvent ev = mediaButtonIntent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                if (ev == null) return false;
                if (ev.getRepeatCount() > 0) return true; // swallow auto-repeat of a held key
                String name;
                switch (ev.getKeyCode()) {
                    case KeyEvent.KEYCODE_HEADSETHOOK: name = "HEADSETHOOK"; break;
                    case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: name = "MEDIA_PLAY_PAUSE"; break;
                    case KeyEvent.KEYCODE_MEDIA_PLAY: name = "MEDIA_PLAY"; break;
                    case KeyEvent.KEYCODE_MEDIA_PAUSE: name = "MEDIA_PAUSE"; break;
                    case KeyEvent.KEYCODE_MEDIA_NEXT: name = "MEDIA_NEXT"; break;
                    case KeyEvent.KEYCODE_MEDIA_PREVIOUS: name = "MEDIA_PREVIOUS"; break;
                    default: name = "OTHER:" + ev.getKeyCode();
                }
                HeadsetButtonPlugin.emit(name, ev.getAction() == KeyEvent.ACTION_DOWN ? "down" : "up", "media_session");
                return true;
            }
        });
        applySessionActive();
    }

    private static void sendHeartbeats() {
        String base = apiBaseUrl;
        if (base == null || base.isEmpty()) return;
        if (!base.endsWith("/")) base = base + "/";
        for (String id : sessionIds) {
            java.net.HttpURLConnection c = null;
            try {
                c = (java.net.HttpURLConnection) new java.net.URL(
                        base + "heartbeat/" + java.net.URLEncoder.encode(id, "UTF-8")).openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(5000);
                String key = apiKey;
                if (key != null && !key.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + key);
                if (c.getResponseCode() == 410) sessionIds.remove(id); // session ended on the server
            } catch (Exception ignored) {
                // Offline or server unreachable: retry on the next tick.
            } finally {
                if (c != null) c.disconnect();
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
        instance = this;
        createMediaSession();
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

        heartbeats = java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
        heartbeats.scheduleWithFixedDelay(CallService::sendHeartbeats, 10, 10,
                java.util.concurrent.TimeUnit.SECONDS);
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
        instance = null;
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        if (heartbeats != null) heartbeats.shutdownNow();
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
