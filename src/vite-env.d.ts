/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_STORAGE_BUCKET?: string;
  /** Cloudflare Web Analytics token; analytics stay off without it. */
  readonly VITE_CF_ANALYTICS_TOKEN?: string;
  /** Short commit id of this build (set in vite.config.ts), shown in crash reports. */
  readonly VITE_RELEASE?: string;
  /** "1" when the app was built with Firebase (android/app/google-services.json): push notifications on. */
  readonly VITE_PUSH_READY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
