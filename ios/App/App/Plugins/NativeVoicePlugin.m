#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(NativeVoicePlugin, "NativeVoice",
           CAP_PLUGIN_METHOD(join, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(leave, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(setMicEnabled, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(setOutputMuted, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(setVolume, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(sendData, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(listCalls, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(checkMicPermission, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(requestMicPermission, CAPPluginReturnPromise);
)
