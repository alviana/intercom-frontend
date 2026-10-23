import { useState } from "react";
import { FormItem } from "../user-settings-form/form-item";
import {
  applyCallKitMode,
  readStoredCallKitMode,
} from "../../utils/ios-callkit-mode";

/** iOS only: the Bluetooth headset button through an iPhone (CallKit) call. */
export const CallKitModeSwitch = () => {
  const [enabled, setEnabled] = useState(readStoredCallKitMode);

  return (
    <FormItem label="Botão do fone Bluetooth">
      <span style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
        <input
          type="checkbox"
          role="switch"
          style={{ width: "2.4rem", height: "2.4rem", flexShrink: 0 }}
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            applyCallKitMode(e.target.checked);
          }}
        />
        {/* Native switches mode only when the first line opens (see setCallKitMode). */}
        <span>
          Usa a chamada do iPhone para o botão do fone Bluetooth. Desligue se o
          áudio cortar. Vale ao entrar de novo nas linhas.
        </span>
      </span>
    </FormItem>
  );
};
