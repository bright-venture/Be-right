/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_STORAGE_BUCKET?: string;
  /** Cloudflare Web Analytics token; analytics stay off without it. */
  readonly VITE_CF_ANALYTICS_TOKEN?: string;
  /** MapTiler key for map images; OpenStreetMap's free tiles are used without it. */
  /** Short commit id of this build (set in vite.config.ts), shown in crash reports. */
  readonly VITE_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
