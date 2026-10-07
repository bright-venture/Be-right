import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET || "request-media",
  /** Private bucket for technician documents (ID, criminal record, proof of address, photo). */
  docsBucket: process.env.SUPABASE_DOCS_BUCKET || "technician-docs",
  /** Public address of the site, used in links inside emails. */
  siteUrl: (process.env.SITE_URL || "https://be-rightbright.com").replace(/\/+$/, ""),
  /** Resend API key for notification emails; without it, notifications are skipped. */
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "Be Right <noreply@be-rightbright.com>",
  /** Where replies to notifications go (customers reply to report a problem). */
  emailReplyTo: process.env.EMAIL_REPLY_TO || "hello@be-rightbright.com",
  /** Comma-separated emails that get the admin role on sign-in: the owners (see /admin). */
  ownerEmails: (process.env.OWNER_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  /** Comma-separated emails that get the specialist role on sign-in (ADMIN_EMAILS is the old name). */
  specialistEmails: (process.env.SPECIALIST_EMAILS || process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
};
