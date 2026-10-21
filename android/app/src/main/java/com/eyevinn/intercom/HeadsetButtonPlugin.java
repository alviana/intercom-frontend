package com.eyevinn.intercom;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

// Only forwards headset button events (emitted by CallService's MediaSession) to JS.
@CapacitorPlugin(name = "HeadsetButton")
public class HeadsetButtonPlugin extends Plugin {
    private static volatile HeadsetButtonPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
    }

    static void emit(String key, String action, String source) {
        HeadsetButtonPlugin p = instance;
        if (p == null) return;
        JSObject data = new JSObject();
        data.put("key", key);
        data.put("action", action);
        data.put("source", source);
        p.notifyListeners("headsetButton", data);
    }
}
