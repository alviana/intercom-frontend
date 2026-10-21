package com.eyevinn.intercom;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

public class OverlayService extends Service {
    public static final String ACTION = "com.eyevinn.intercom.BUBBLE_ACTION";
    public static final String ACTION_UPDATE = "com.eyevinn.intercom.BUBBLE_UPDATE";
    public static volatile boolean isRunning = false;

    private static final int COLOR_BG = 0xF0121212;
    private static final int COLOR_ROW = 0xFF2A2A2A;
    private static final int COLOR_ENABLED = 0xFF43A047;
    private static final int COLOR_DISABLED = 0xFFE53935;
    private static final int COLOR_PTT = 0xFF1565C0;
    private static final int COLOR_METER_ACTIVE = 0xFFB2FF59;
    private static final int COLOR_METER_INACTIVE = 0x55333333;
    private static final int[] TILE_HEADER_COLORS = {
            0xFF00897B,
            0xFF7CB342,
            0xFF42A5F5,
            0xFFEF5350,
            0xFFAB47BC,
            0xFFFF7043,
    };

    private WindowManager windowManager;
    private View overlayView;
    private WindowManager.LayoutParams params;
    private LinearLayout controlsContainer;
    private LinearLayout headerBar;
    private ScrollView scrollContainer;
    private boolean expanded = true;
    private int rowCount = 1;
    private boolean[] rowLatch = new boolean[] { false };
    private boolean[] rowListen = new boolean[] { true };
    private boolean[] rowPttHeld = new boolean[] { false };
    private boolean[] rowAllowed = new boolean[] { true };
    private boolean[] rowListenAllowed = new boolean[] { true };
    private boolean[] rowActivity = new boolean[] { false };
    private String[] rowLabels = new String[] { "Call 1" };
    private final Runnable[] rowLongPressRunnables = new Runnable[16];
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean hasPendingUpdate = false;
    private int pendingCount = 0;
    private boolean[] pendingLatch = null;
    private boolean[] pendingListen = null;
    private boolean[] pendingAllowed = null;
    private boolean[] pendingListenAllowed = null;
    private boolean[] pendingActivity = null;
    private String[] pendingLabels = null;
    private android.content.BroadcastReceiver updateReceiver;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        startOverlayNotification();
        buildOverlayWindow();
        registerUpdateReceiver();
    }

    private void startOverlayNotification() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        String channelId = "intercom_bubble_channel";
        NotificationChannel channel = new NotificationChannel(
                channelId,
                "Controles flutuantes do intercom",
                NotificationManager.IMPORTANCE_MIN
        );
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.createNotificationChannel(channel);
        int flags = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                ? (android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE)
                : android.app.PendingIntent.FLAG_UPDATE_CURRENT;

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setAction("com.eyevinn.intercom.OPEN");
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        android.app.PendingIntent openPI = android.app.PendingIntent.getActivity(this, 2101, openIntent, flags);

        Intent exitIntent = new Intent(this, MainActivity.class);
        exitIntent.setAction("com.eyevinn.intercom.EXIT");
        exitIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        android.app.PendingIntent exitPI = android.app.PendingIntent.getActivity(this, 2102, exitIntent, flags);

        Notification notification = new NotificationCompat.Builder(this, channelId)
                .setContentTitle("Controles do intercom ativos")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .setContentIntent(openPI)
                .addAction(0, "Abrir", openPI)
                .addAction(0, "Sair", exitPI)
                .build();
        startForeground(1, notification);
    }

    private void buildOverlayWindow() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : legacyOverlayType();

        params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = dp(12);
        params.y = dp(96);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(COLOR_BG);
        int outerPad = dp(6);
        root.setPadding(outerPad, outerPad, outerPad, outerPad);

        headerBar = buildHeaderBar();
        root.addView(headerBar);

        scrollContainer = new ScrollView(this);
        scrollContainer.setFillViewport(false);
        LinearLayout.LayoutParams scrollLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        scrollLp.topMargin = dp(4);
        scrollContainer.setLayoutParams(scrollLp);

        controlsContainer = new LinearLayout(this);
        controlsContainer.setOrientation(LinearLayout.HORIZONTAL);
        controlsContainer.setPadding(dp(2), 0, dp(2), 0);
        scrollContainer.addView(controlsContainer);
        root.addView(scrollContainer);

        buildRows();
        overlayView = root;
        attachDragHandler(headerBar);
        windowManager.addView(overlayView, params);
    }

    private LinearLayout buildHeaderBar() {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(0xFF1E1E1E);
        int padH = dp(10);
        int padV = dp(8);
        header.setPadding(padH, padV, padH, padV);

        TextView title = new TextView(this);
        title.setText("Intercom");
        title.setTextColor(0xFFFFFFFF);
        title.setTextSize(15);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        header.addView(title);

        View spacer = new View(this);
        LinearLayout.LayoutParams spacerLp = new LinearLayout.LayoutParams(0, 1, 1f);
        spacer.setLayoutParams(spacerLp);
        header.addView(spacer);

        ImageView openBtn = buildHeaderIcon(android.R.drawable.ic_menu_call);
        openBtn.setContentDescription("Abrir app");
        openBtn.setOnClickListener(v -> openMainActivity());
        header.addView(openBtn);

        ImageView collapseBtn = buildHeaderIcon(android.R.drawable.ic_menu_agenda);
        collapseBtn.setContentDescription(expanded ? "Recolher" : "Expandir");
        collapseBtn.setOnClickListener(v -> toggleControls(collapseBtn));
        header.addView(collapseBtn);

        return header;
    }

    private ImageView buildHeaderIcon(int resId) {
        ImageView iv = new ImageView(this);
        iv.setImageResource(resId);
        int size = dp(32);
        int pad = dp(6);
        iv.setPadding(pad, pad, pad, pad);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(size, size);
        lp.setMargins(dp(4), 0, 0, 0);
        iv.setLayoutParams(lp);
        iv.setBackgroundColor(0xFF333333);
        iv.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        return iv;
    }

    private void openMainActivity() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setAction("com.eyevinn.intercom.OPEN");
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(openIntent);
    }

    private void toggleControls(ImageView collapseBtn) {
        expanded = !expanded;
        if (scrollContainer != null) {
            scrollContainer.setVisibility(expanded ? View.VISIBLE : View.GONE);
        }
        if (collapseBtn != null) {
            collapseBtn.setContentDescription(expanded ? "Recolher" : "Expandir");
        }
    }

    private void attachDragHandler(View dragHandle) {
        dragHandle.setOnTouchListener(new View.OnTouchListener() {
            private int initialX;
            private int initialY;
            private float initialTouchX;
            private float initialTouchY;
            private boolean moved;
            final int slop = ViewConfiguration.get(OverlayService.this).getScaledTouchSlop();

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        moved = false;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (event.getRawX() - initialTouchX);
                        int dy = (int) (event.getRawY() - initialTouchY);
                        if (Math.abs(dx) > slop || Math.abs(dy) > slop) moved = true;
                        params.x = initialX + dx;
                        params.y = initialY + dy;
                        windowManager.updateViewLayout(overlayView, params);
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moved) v.performClick();
                        return true;
                    default:
                        return false;
                }
            }
        });
    }

    private void registerUpdateReceiver() {
        updateReceiver = new android.content.BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!ACTION_UPDATE.equals(intent.getAction())) return;
                int c = intent.getIntExtra("count", rowCount);
                boolean[] latch = intent.getBooleanArrayExtra("latch");
                boolean[] listen = intent.getBooleanArrayExtra("listen");
                boolean[] allowed = intent.getBooleanArrayExtra("allowed");
                boolean[] listenAllowed = intent.getBooleanArrayExtra("listenAllowed");
                boolean[] activity = intent.getBooleanArrayExtra("activity");
                String[] labels = intent.getStringArrayExtra("labels");
                if (anyPttHeld()) {
                    queuePendingUpdate(c, latch, listen, allowed, listenAllowed, activity, labels);
                    return;
                }
                applyRowState(c, latch, listen, allowed, listenAllowed, activity, labels, true);
                refreshRows();
            }
        };
        registerReceiver(updateReceiver, new android.content.IntentFilter(ACTION_UPDATE));
    }

    private boolean anyPttHeld() {
        if (rowPttHeld == null) return false;
        for (boolean held : rowPttHeld) {
            if (held) return true;
        }
        return false;
    }

    private void queuePendingUpdate(int c, boolean[] latch, boolean[] listen, boolean[] allowed, boolean[] listenAllowed, boolean[] activity, String[] labels) {
        hasPendingUpdate = true;
        pendingCount = Math.max(1, c);
        pendingLatch = latch;
        pendingListen = listen;
        pendingAllowed = allowed;
        pendingListenAllowed = listenAllowed;
        pendingActivity = activity;
        pendingLabels = labels;
    }

    private void applyRowState(int c, boolean[] latch, boolean[] listen, boolean[] allowed, boolean[] listenAllowed, boolean[] activity, String[] labels, boolean preserveHeld) {
        int prevCount = rowCount;
        boolean[] prevHeld = rowPttHeld;
        rowCount = Math.max(1, c);
        rowLatch = (latch != null && latch.length == rowCount) ? latch : new boolean[rowCount];
        rowListen = (listen != null && listen.length == rowCount) ? listen : new boolean[rowCount];
        rowAllowed = (allowed != null && allowed.length == rowCount) ? allowed : new boolean[rowCount];
        rowListenAllowed = new boolean[rowCount];
        for (int i = 0; i < rowCount; i++) {
            rowListenAllowed[i] = listenAllowed != null && listenAllowed.length == rowCount
                ? listenAllowed[i]
                : true;
        }
        rowActivity = (activity != null && activity.length == rowCount) ? activity : new boolean[rowCount];
        rowLabels = (labels != null && labels.length == rowCount) ? labels : defaultLabels(rowCount);
        if (preserveHeld) {
            boolean[] nextHeld = new boolean[rowCount];
            if (prevHeld != null) {
                int copy = Math.min(prevCount, rowCount);
                for (int i = 0; i < copy; i++) nextHeld[i] = prevHeld[i];
            }
            rowPttHeld = nextHeld;
        } else {
            rowPttHeld = new boolean[rowCount];
        }
    }

    private String[] defaultLabels(int count) {
        String[] labels = new String[count];
        for (int i = 0; i < count; i++) labels[i] = "Linha " + (i + 1);
        return labels;
    }

    private void applyPendingUpdateIfReady() {
        if (!hasPendingUpdate || anyPttHeld()) return;
        applyRowState(pendingCount, pendingLatch, pendingListen, pendingAllowed, pendingListenAllowed, pendingActivity, pendingLabels, false);
        hasPendingUpdate = false;
        pendingCount = 0;
        pendingLatch = null;
        pendingListen = null;
        pendingAllowed = null;
        pendingListenAllowed = null;
        pendingActivity = null;
        pendingLabels = null;
        refreshRows();
    }

    @SuppressWarnings("deprecation")
    private static int legacyOverlayType() {
        return WindowManager.LayoutParams.TYPE_PHONE;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_NOT_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        AudioRoutePlugin.releaseAppAudioRouting(this);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    private int dp(int v) {
        return (int) (getResources().getDisplayMetrics().density * v);
    }

    private void sendAction(String action) {
        Intent intent = new Intent(ACTION);
        intent.putExtra("action", action);
        sendBroadcast(intent);
    }

    private void sendAction(String action, int index) {
        Intent intent = new Intent(ACTION);
        intent.putExtra("action", action);
        intent.putExtra("index", index);
        sendBroadcast(intent);
    }

    private int tileHeaderColor(int idx) {
        return TILE_HEADER_COLORS[idx % TILE_HEADER_COLORS.length];
    }

    private void refreshRows() {
        if (controlsContainer == null) return;
        if (controlsContainer.getChildCount() == rowCount) {
            for (int i = 0; i < rowCount; i++) {
                updateTileInPlace((LinearLayout) controlsContainer.getChildAt(i), i);
            }
            return;
        }
        buildRows();
    }

    private void updateTileInPlace(LinearLayout tile, int idx) {
        if (tile.getChildCount() < 3) return;

        LinearLayout header = (LinearLayout) tile.getChildAt(0);
        if (header.getChildCount() > 0) {
            TextView nameView = (TextView) header.getChildAt(0);
            String label = rowLabels != null && rowLabels.length > idx ? rowLabels[idx] : ("Linha " + (idx + 1));
            nameView.setText(label);
            header.setBackgroundColor(tileHeaderColor(idx));
            if (header.getChildCount() > 1) {
                updateActivityMeter((LinearLayout) header.getChildAt(1), idx);
            }
        }

        ImageView listenBtn = (ImageView) tile.getChildAt(1);
        boolean listenOn = rowListen != null && rowListen.length > idx && rowListen[idx];
        listenBtn.setImageResource(listenOn ? R.drawable.ic_volume_on : R.drawable.ic_volume_off);
        listenBtn.setColorFilter(listenOn ? COLOR_ENABLED : COLOR_DISABLED);

        LinearLayout micRow = (LinearLayout) tile.getChildAt(2);
        ImageView micIcon = (ImageView) micRow.getChildAt(0);
        updateMicVisual(idx, micRow, micIcon);

        boolean micAllowedRow = rowAllowed != null && rowAllowed.length > idx && rowAllowed[idx];
        boolean listenAllowedRow = rowListenAllowed != null && rowListenAllowed.length > idx && rowListenAllowed[idx];
        listenBtn.setEnabled(listenAllowedRow);
        micRow.setEnabled(micAllowedRow);
        listenBtn.setAlpha(listenAllowedRow ? 1.0f : 0.4f);
        micRow.setAlpha(micAllowedRow ? 1.0f : 0.4f);
    }

    private void updateMicVisual(int idx, LinearLayout micRow, ImageView micIcon) {
        boolean latch = rowLatch != null && rowLatch.length > idx && rowLatch[idx];
        boolean held = rowPttHeld != null && rowPttHeld.length > idx && rowPttHeld[idx];
        if (held) {
            micRow.setBackgroundColor(COLOR_PTT);
            micIcon.setImageResource(R.drawable.ic_mic_on);
            micIcon.setColorFilter(0xFFFFFFFF);
        } else {
            micRow.setBackgroundColor(COLOR_ROW);
            micIcon.setImageResource(latch ? R.drawable.ic_mic_on : R.drawable.ic_mic_off);
            micIcon.setColorFilter(latch ? COLOR_ENABLED : COLOR_DISABLED);
        }
    }

    private void buildRows() {
        if (controlsContainer == null) return;
        cancelAllLongPressCallbacks();
        controlsContainer.removeAllViews();
        for (int i = 0; i < rowCount; i++) {
            controlsContainer.addView(buildTile(i));
        }
    }

    private void cancelAllLongPressCallbacks() {
        for (int i = 0; i < rowLongPressRunnables.length; i++) {
            if (rowLongPressRunnables[i] != null) {
                mainHandler.removeCallbacks(rowLongPressRunnables[i]);
                rowLongPressRunnables[i] = null;
            }
        }
    }

    private LinearLayout buildTile(final int idx) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        int tileWidth = dp(108);
        LinearLayout.LayoutParams tileLp = new LinearLayout.LayoutParams(tileWidth, LinearLayout.LayoutParams.WRAP_CONTENT);
        tileLp.setMargins(dp(4), 0, dp(4), 0);
        tile.setLayoutParams(tileLp);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER);
        header.setBackgroundColor(tileHeaderColor(idx));
        int headerPad = dp(8);
        header.setPadding(headerPad, dp(6), headerPad, dp(6));

        TextView nameView = new TextView(this);
        String label = rowLabels != null && rowLabels.length > idx ? rowLabels[idx] : ("Linha " + (idx + 1));
        nameView.setText(label);
        nameView.setTextColor(0xFF111111);
        nameView.setTextSize(12);
        nameView.setTypeface(Typeface.DEFAULT_BOLD);
        nameView.setMaxLines(1);
        nameView.setEllipsize(TextUtils.TruncateAt.END);
        nameView.setGravity(Gravity.CENTER);
        header.addView(nameView, new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
        ));

        LinearLayout meter = buildActivityMeter();
        LinearLayout.LayoutParams meterLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                dp(18)
        );
        meterLp.leftMargin = dp(6);
        header.addView(meter, meterLp);

        ImageView listenBtn = new ImageView(this);
        listenBtn.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        listenBtn.setBackgroundColor(COLOR_ROW);
        listenBtn.setPadding(dp(10), dp(10), dp(10), dp(10));
        LinearLayout.LayoutParams listenLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(44)
        );
        listenLp.topMargin = dp(2);
        listenBtn.setLayoutParams(listenLp);
        listenBtn.setContentDescription("Ouvir");
        listenBtn.setOnClickListener(v -> sendAction("listen", idx));

        LinearLayout micRow = new LinearLayout(this);
        micRow.setOrientation(LinearLayout.VERTICAL);
        micRow.setGravity(Gravity.CENTER);
        micRow.setBackgroundColor(COLOR_ROW);
        LinearLayout.LayoutParams micRowLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(56)
        );
        micRowLp.topMargin = dp(2);
        micRow.setLayoutParams(micRowLp);

        ImageView micIcon = new ImageView(this);
        micIcon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        micIcon.setImageResource(R.drawable.ic_mic_off);
        micRow.addView(micIcon, new LinearLayout.LayoutParams(dp(28), dp(28)));
        micRow.setContentDescription("Falar (toque para travar, segure para falar)");
        attachDualMicControl(micRow, micIcon, idx);

        tile.addView(header);
        tile.addView(listenBtn);
        tile.addView(micRow);
        updateTileInPlace(tile, idx);
        return tile;
    }

    private LinearLayout buildActivityMeter() {
        LinearLayout meter = new LinearLayout(this);
        meter.setOrientation(LinearLayout.HORIZONTAL);
        meter.setGravity(Gravity.BOTTOM);
        for (int i = 0; i < 3; i++) {
            View bar = new View(this);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(3), dp(6 + (i * 4)));
            lp.leftMargin = i == 0 ? 0 : dp(2);
            bar.setLayoutParams(lp);
            meter.addView(bar);
        }
        return meter;
    }

    private void updateActivityMeter(LinearLayout meter, int idx) {
        boolean active = rowActivity != null && rowActivity.length > idx && rowActivity[idx];
        for (int i = 0; i < meter.getChildCount(); i++) {
            View bar = meter.getChildAt(i);
            bar.setBackgroundColor(active ? COLOR_METER_ACTIVE : COLOR_METER_INACTIVE);
            bar.setAlpha(active ? 1.0f : 0.45f);
        }
    }

    private void attachDualMicControl(final LinearLayout micRow, final ImageView micIcon, final int idx) {
        final int longPressTimeout = ViewConfiguration.getLongPressTimeout();
        rowLongPressRunnables[idx] = () -> {
            if (rowPttHeld == null || idx >= rowPttHeld.length) return;
            if (rowAllowed == null || idx >= rowAllowed.length || !rowAllowed[idx]) return;
            rowPttHeld[idx] = true;
            micRow.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK);
            sendAction("ptt_down", idx);
            updateMicVisual(idx, micRow, micIcon);
        };

        micRow.setOnTouchListener((v, event) -> {
            if (rowAllowed == null || idx >= rowAllowed.length || !rowAllowed[idx]) return false;
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    mainHandler.postDelayed(rowLongPressRunnables[idx], longPressTimeout);
                    return true;
                case MotionEvent.ACTION_MOVE:
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    mainHandler.removeCallbacks(rowLongPressRunnables[idx]);
                    if (rowPttHeld != null && idx < rowPttHeld.length && rowPttHeld[idx]) {
                        rowPttHeld[idx] = false;
                        sendAction("ptt_up", idx);
                        applyPendingUpdateIfReady();
                    } else {
                        sendAction("talk_latch", idx);
                    }
                    updateMicVisual(idx, micRow, micIcon);
                    return true;
                default:
                    return true;
            }
        });
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        AudioRoutePlugin.releaseAppAudioRouting(this);
        cancelAllLongPressCallbacks();
        if (overlayView != null) windowManager.removeView(overlayView);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopFgCompat();
        }
        isRunning = false;
        try { if (updateReceiver != null) unregisterReceiver(updateReceiver); } catch (Exception ignored) {}
    }

    @SuppressWarnings("deprecation")
    private void stopFgCompat() {
        stopForeground(true);
    }
}
