import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ke.co.mverify.mobile",
  appName: "M-Verify",
  webDir: "dist",
  server: {
    androidScheme: "https"
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
