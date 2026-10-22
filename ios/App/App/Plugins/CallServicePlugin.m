#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(CallServicePlugin, "CallService",
           CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(isRunning, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(hasNotificationPermission, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(hasRecordAudioPermission, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(requestNotificationPermission, CAPPluginReturnPromise);
)

CAP_PLUGIN(HeadsetButtonPlugin, "HeadsetButton", )
