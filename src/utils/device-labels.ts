export const formatMediaDeviceLabel = (
  device: Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">,
  index: number
): string => {
  const explicitLabel = device.label?.trim();
  if (explicitLabel) {
    if (device.kind === "audioinput") {
      const normalized = explicitLabel.toLowerCase();
      if (normalized === "speakerphone") return "Microfone do celular";
      if (normalized === "headset earpiece")
        return "Microfone do fone de ouvido";
    }
    if (device.kind === "audiooutput") {
      const normalized = explicitLabel.toLowerCase();
      if (normalized === "speakerphone") return "Alto-falante do celular";
      if (normalized === "headset earpiece") return "Auricular do celular";
    }
    return explicitLabel;
  }

  if (device.deviceId === "default" && device.kind === "audioinput") {
    return "Microfone padrão do sistema";
  }
  if (device.deviceId === "default" && device.kind === "audiooutput") {
    return "Alto-falante padrão do sistema";
  }
  if (device.kind === "audioinput") return `Microfone ${index + 1}`;
  if (device.kind === "audiooutput") return `Alto-falante ${index + 1}`;
  return `Dispositivo ${index + 1}`;
};
