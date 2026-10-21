package com.eyevinn.intercom;

import android.bluetooth.BluetoothA2dp;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothHeadset;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioDeviceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.Manifest;
import android.content.pm.PackageManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {
    private AudioManager audioManager;
    private BroadcastReceiver routeReceiver;
    private Thread toneThread;
    private volatile boolean tonePlaying = false;
    private Integer previousAudioMode = null;

    @Override
    public void load() {
        Context ctx = getContext();
        audioManager = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);

        // Listen for headset plug/unplug, Bluetooth and SCO changes
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_HEADSET_PLUG);
        filter.addAction(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED);
        filter.addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED);
        filter.addAction(BluetoothHeadset.ACTION_AUDIO_STATE_CHANGED);
        routeReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                emitRoutes();
            }
        };
        ctx.registerReceiver(routeReceiver, filter);

        // Initial emit
        emitRoutes();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        stopTone();
        releaseAudioRouting();
        try {
            if (routeReceiver != null) getContext().unregisterReceiver(routeReceiver);
        } catch (Exception ignored) {}
    }

    public static void releaseAppAudioRouting(Context context) {
        AudioManager manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        releaseAudioRouting(manager, null);
    }

    @PluginMethod
    public void hasBluetoothPermission(com.getcapacitor.PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            granted = ActivityCompat.checkSelfPermission(
                    getContext(),
                    Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED;
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestBluetoothPermission(com.getcapacitor.PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(
                    getContext(),
                    Manifest.permission.BLUETOOTH_CONNECT
            ) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        getActivity(),
                        new String[]{Manifest.permission.BLUETOOTH_CONNECT},
                        1003
                );
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getAvailableRoutes(PluginCall call) {
        call.resolve(buildRoutesPayload());
    }

    private JSObject buildRoutesPayload() {
        JSObject ret = new JSObject();
        JSArray routes = new JSArray();

        if (audioManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo[] devices = audioManager.getAvailableCommunicationDevices().toArray(new AudioDeviceInfo[0]);
            for (AudioDeviceInfo d : devices) {
                String type = routeType(d.getType());
                if (type != null) {
                    routes.put(routeObj(routeId(d), routeLabel(d), true, type));
                }
            }
        } else if (audioManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            if (!addFirstRouteForType(routes, devices, AudioDeviceInfo.TYPE_WIRED_HEADSET, "headset", isWiredHeadsetOn())) {
                addFirstRouteForType(routes, devices, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, "headset", isWiredHeadsetOn());
            }
            addFirstRouteForType(routes, devices, AudioDeviceInfo.TYPE_BUILTIN_EARPIECE, "earpiece", hasEarpiece());
            if (!addFirstRouteForType(routes, devices, AudioDeviceInfo.TYPE_BLUETOOTH_SCO, "bluetooth", isBluetoothOn())) {
                addFirstRouteForType(routes, devices, AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, "bluetooth", isBluetoothOn());
            }
            addFirstRouteForType(routes, devices, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, "speaker", true);
        } else {
            routes.put(routeObj("headset", "Fone com fio", isWiredHeadsetOn(), "headset"));
            routes.put(routeObj("earpiece", "Receptor do telefone", hasEarpiece(), "earpiece"));
            routes.put(routeObj("bluetooth", "Áudio Bluetooth", isBluetoothOn(), "bluetooth"));
            routes.put(routeObj("speaker", "Alto-falante do telefone", true, "speaker"));
        }

        ret.put("routes", routes);
        ret.put("active", getActiveRoute());
        return ret;
    }

    private void emitRoutes() {
        JSObject payload = buildRoutesPayload();
        notifyListeners("audioRouteChanged", payload);
    }

    private JSObject routeObj(String id, String label, boolean available, String type) {
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("label", label);
        o.put("available", available);
        o.put("type", type);
        return o;
    }

    private String getActiveRoute() {
        if (audioManager == null) return null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo dev = audioManager.getCommunicationDevice();
            if (dev != null) {
                return routeId(dev);
            }
        }
        return getActiveRouteLegacy();
    }

    private String routeId(AudioDeviceInfo device) {
        return "device:" + device.getId();
    }

    private String routeLabel(AudioDeviceInfo device) {
        String prefix = routeLabelPrefix(device.getType());
        if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                || device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) {
            return prefix;
        }
        CharSequence productName = device.getProductName();
        String name = productName != null ? productName.toString().trim() : "";
        if (name.length() == 0 || name.equalsIgnoreCase(prefix)) {
            return prefix;
        }
        return prefix + ": " + name;
    }

    private String routeType(int androidType) {
        if (androidType == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || androidType == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) return "bluetooth";
        if (androidType == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return "speaker";
        if (androidType == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || androidType == AudioDeviceInfo.TYPE_WIRED_HEADSET) return "headset";
        if (androidType == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return "earpiece";
        return null;
    }

    private String routeLabelPrefix(int androidType) {
        String type = routeType(androidType);
        if ("bluetooth".equals(type)) return "Áudio Bluetooth";
        if ("speaker".equals(type)) return "Alto-falante do telefone";
        if ("headset".equals(type)) return "Fone com fio";
        if ("earpiece".equals(type)) return "Receptor do telefone";
        return "Saída de áudio";
    }

    private boolean addFirstRouteForType(JSArray routes, AudioDeviceInfo[] devices, int androidType, String fallbackId, boolean available) {
        for (AudioDeviceInfo d : devices) {
            if (d.getType() == androidType) {
                routes.put(routeObj(fallbackId, routeLabel(d), available, routeType(androidType)));
                return true;
            }
        }
        return false;
    }

    @SuppressWarnings("deprecation")
    private String getActiveRouteLegacy() {
        // Best-effort for pre-S devices
        if (audioManager.isBluetoothScoOn() || audioManager.isBluetoothA2dpOn()) return "bluetooth";
        if (audioManager.isSpeakerphoneOn()) return "speaker";
        if (isWiredHeadsetOn()) return "headset";
        if (hasEarpiece()) return "earpiece";
        return null;
    }

    private boolean hasEarpiece() {
        if (audioManager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            for (AudioDeviceInfo d : devices) {
                if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return true;
            }
            return false;
        }
        // Pre-M fallback: assume phones have earpiece
        return true;
    }

    @SuppressWarnings("deprecation")
    private boolean isWiredHeadsetOn() {
        if (audioManager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            for (AudioDeviceInfo d : devices) {
                if (d.getType() == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || d.getType() == AudioDeviceInfo.TYPE_WIRED_HEADSET) return true;
            }
            return false;
        }
        return audioManager.isWiredHeadsetOn();
    }

    private boolean isBluetoothOn() {
        if (audioManager == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            for (AudioDeviceInfo d : devices) {
                int t = d.getType();
                if (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) return true;
            }
            return false;
        }
        // Pre-M: use BluetoothManager to infer connection state
        android.bluetooth.BluetoothManager bm = (android.bluetooth.BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bm != null ? bm.getAdapter() : null;
        if (adapter != null) {
            int a2dp = adapter.getProfileConnectionState(BluetoothProfile.A2DP);
            int headset = adapter.getProfileConnectionState(BluetoothProfile.HEADSET);
            return a2dp == BluetoothProfile.STATE_CONNECTED || headset == BluetoothProfile.STATE_CONNECTED;
        }
        return false;
    }

    @PluginMethod
    @SuppressWarnings("deprecation")
    public void setRoute(PluginCall call) {
        if (audioManager == null) { call.reject("AudioManager not available"); return; }
        String route = call.getString("route");
        if (route == null) { call.reject("Missing 'route'"); return; }

        activateCommunicationAudio();

        if (route.startsWith("device:")) {
            AudioDeviceInfo device = findOutputDeviceByRouteId(route);
            if (device == null) { call.reject("Unknown route: " + route); return; }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.setCommunicationDevice(device);
            } else {
                applyLegacyRouteType(routeType(device.getType()));
            }
            JSObject ret = new JSObject();
            ret.put("active", getActiveRoute());
            call.resolve(ret);
            emitRoutes();
            return;
        }

        switch (route) {
            case "speaker": {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    setCommDeviceByType(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER);
                } else {
                    audioManager.stopBluetoothSco();
                    audioManager.setBluetoothScoOn(false);
                    audioManager.setSpeakerphoneOn(true);
                }
                break;
            }
            case "earpiece": {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    setCommDeviceByType(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE);
                } else {
                    audioManager.stopBluetoothSco();
                    audioManager.setBluetoothScoOn(false);
                    audioManager.setSpeakerphoneOn(false);
                }
                break;
            }
            case "headset": {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // Prefer wired headset/headphones
                    if (!setCommDeviceByType(AudioDeviceInfo.TYPE_WIRED_HEADPHONES)) {
                        setCommDeviceByType(AudioDeviceInfo.TYPE_WIRED_HEADSET);
                    }
                } else {
                    // Let system route to wired headset if plugged; ensure speaker is off
                    audioManager.stopBluetoothSco();
                    audioManager.setBluetoothScoOn(false);
                    audioManager.setSpeakerphoneOn(false);
                }
                break;
            }
            case "bluetooth": {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // Prefer SCO for comms, fallback to A2DP if needed
                    if (!setCommDeviceByType(AudioDeviceInfo.TYPE_BLUETOOTH_SCO)) {
                        setCommDeviceByType(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP);
                    }
                } else {
                    audioManager.startBluetoothSco();
                    audioManager.setBluetoothScoOn(true);
                    audioManager.setSpeakerphoneOn(false);
                }
                break;
            }
            default:
                call.reject("Unknown route: " + route);
                return;
        }

        JSObject ret = new JSObject();
        ret.put("active", getActiveRoute());
        call.resolve(ret);
        emitRoutes();
    }

    @PluginMethod
    public void playTestTone(PluginCall call) {
        int durationMs = call.getInt("durationMs", 5000);
        int frequencyHz = call.getInt("frequencyHz", 440);
        activateCommunicationAudio();
        stopTone();
        tonePlaying = true;
        toneThread = new Thread(() -> playTone(durationMs, frequencyHz), "IntercomAudioRouteTone");
        toneThread.start();
        call.resolve();
    }

    @PluginMethod
    public void stopTestTone(PluginCall call) {
        stopTone();
        call.resolve();
    }

    private void stopTone() {
        tonePlaying = false;
        if (toneThread != null) {
            try {
                toneThread.interrupt();
            } catch (Exception ignored) {}
            toneThread = null;
        }
    }

    private void activateCommunicationAudio() {
        if (audioManager == null) return;
        if (previousAudioMode == null) {
            previousAudioMode = audioManager.getMode();
        }
        if (audioManager.getMode() != AudioManager.MODE_IN_COMMUNICATION) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        }
    }

    private void releaseAudioRouting() {
        releaseAudioRouting(audioManager, previousAudioMode);
        previousAudioMode = null;
    }

    @SuppressWarnings("deprecation")
    private static void releaseAudioRouting(AudioManager manager, Integer previousMode) {
        if (manager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                manager.clearCommunicationDevice();
            }
        } catch (Exception ignored) {}
        try {
            manager.stopBluetoothSco();
        } catch (Exception ignored) {}
        try {
            manager.setBluetoothScoOn(false);
        } catch (Exception ignored) {}
        try {
            manager.setSpeakerphoneOn(false);
        } catch (Exception ignored) {}
        try {
            int modeToRestore = previousMode != null
                    ? previousMode
                    : AudioManager.MODE_NORMAL;
            if (manager.getMode() == AudioManager.MODE_IN_COMMUNICATION
                    || previousMode != null) {
                manager.setMode(modeToRestore);
            }
        } catch (Exception ignored) {}
    }

    private void playTone(int durationMs, int frequencyHz) {
        final int sampleRate = 48000;
        final int minBufferSize = AudioTrack.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT
        );
        final int bufferSamples = Math.max(1024, minBufferSize / 2);
        AudioTrack track = null;
        try {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            AudioFormat format = new AudioFormat.Builder()
                    .setSampleRate(sampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build();
            track = new AudioTrack(
                    attrs,
                    format,
                    minBufferSize,
                    AudioTrack.MODE_STREAM,
                    AudioManager.AUDIO_SESSION_ID_GENERATE
            );
            short[] buffer = new short[bufferSamples];
            int totalSamples = Math.max(1, durationMs) * sampleRate / 1000;
            int writtenSamples = 0;
            track.play();
            while (tonePlaying && writtenSamples < totalSamples && !Thread.currentThread().isInterrupted()) {
                int samples = Math.min(buffer.length, totalSamples - writtenSamples);
                for (int i = 0; i < samples; i++) {
                    double phase = 2.0 * Math.PI * frequencyHz * (writtenSamples + i) / sampleRate;
                    buffer[i] = (short) (Math.sin(phase) * Short.MAX_VALUE * 0.12);
                }
                track.write(buffer, 0, samples);
                writtenSamples += samples;
            }
        } catch (Exception ignored) {
        } finally {
            if (track != null) {
                try {
                    track.stop();
                } catch (Exception ignored) {}
                try {
                    track.release();
                } catch (Exception ignored) {}
            }
            tonePlaying = false;
        }
    }

    @SuppressWarnings("deprecation")
    private void applyLegacyRouteType(String type) {
        if ("speaker".equals(type)) {
            audioManager.stopBluetoothSco();
            audioManager.setBluetoothScoOn(false);
            audioManager.setSpeakerphoneOn(true);
        } else if ("earpiece".equals(type) || "headset".equals(type)) {
            audioManager.stopBluetoothSco();
            audioManager.setBluetoothScoOn(false);
            audioManager.setSpeakerphoneOn(false);
        } else if ("bluetooth".equals(type)) {
            audioManager.startBluetoothSco();
            audioManager.setBluetoothScoOn(true);
            audioManager.setSpeakerphoneOn(false);
        }
    }

    private AudioDeviceInfo findOutputDeviceByRouteId(String route) {
        if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
        AudioDeviceInfo[] outs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
        for (AudioDeviceInfo d : outs) {
            if (routeId(d).equals(route)) return d;
        }
        return null;
    }

    private boolean setCommDeviceByType(int type) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AudioDeviceInfo[] outs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            for (AudioDeviceInfo d : outs) {
                if (d.getType() == type) {
                    return audioManager.setCommunicationDevice(d);
                }
            }
        }
        return false;
    }
}
