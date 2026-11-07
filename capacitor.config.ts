import type { CapacitorConfig } from "@capacitor/cli";

// Android app shell. The web build (dist) goes inside the APK; the app can later replace it with the
// latest deployed build (see src/platform/native.ts).
const config: CapacitorConfig = {
  appId: "io.github.dehaka0508.pokeleague",
  appName: "포켓 리그",
  webDir: "dist",
  backgroundColor: "#1d1a2b",
  android: {
    // keep the game clear of the status and navigation bars on Android 15+
    adjustMarginsForEdgeToEdge: "force",
    backgroundColor: "#1d1a2b",
  },
};

export default config;
