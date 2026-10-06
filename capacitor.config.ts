import type { CapacitorConfig } from "@capacitor/cli";

// The Be Right phone app: this website, built by Vite, packaged for Android and iOS.
// Build and copy the site into the apps with `npm run app:sync`.
const config: CapacitorConfig = {
  appId: "com.berightbright.app",
  appName: "Be Right",
  webDir: "dist/public",
  // Page origin inside the app: https://localhost on Android, capacitor://localhost on iOS.
  // The API allows both (server/app.ts).
  server: { androidScheme: "https" },
  // iOS: keep the page below the status bar and above the home indicator.
  ios: { contentInset: "always" },
  plugins: {
    // Android: the page sits between the system bars (src/lib/native.ts sets viewport-fit=auto).
    SystemBars: { insetsHandling: "native", initialViewportFitValueHint: "auto" },
  },
};

export default config;
