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
  // iOS: the page leaves room for the status bar and the home indicator itself (CSS
  // env(safe-area-inset-*), like Android), so the web view isn't inset as well.
  ios: { contentInset: "never" },
  // The background location plugin needs it: with the newer bridge, Android stops location
  // updates after 5 minutes in the background. The app only loads its own pages.
  android: { useLegacyBridge: true },
  plugins: {
    // Android: edge to edge with viewport-fit=cover; the page leaves room for the bars
    // (see src/lib/native.ts).
    SystemBars: { insetsHandling: "native", initialViewportFitValueHint: "cover" },
    // Notifications also show while the app is open (src/lib/push.ts refreshes the screen).
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
