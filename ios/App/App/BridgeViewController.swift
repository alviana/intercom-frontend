import Capacitor

@objc(BridgeViewController)
public class BridgeViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AppControlPlugin())
        bridge?.registerPluginInstance(AudioRoutePlugin())
        bridge?.registerPluginInstance(CallServicePlugin())
        bridge?.registerPluginInstance(HeadsetButtonPlugin())
        bridge?.registerPluginInstance(NativeVoicePlugin())
        bridge?.registerPluginInstance(OverlayBubblePlugin())
    }
}
