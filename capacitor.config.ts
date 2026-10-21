import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.ac24horas.intercom",
  appName: "Intercom ac24horas",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "intercom",
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
