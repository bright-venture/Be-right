import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

const SIGN_IN_TOUCH_MS = 60 * 60 * 1000;

/** ADMIN_EMAILS are admins (everyone else's role is given in the app). */
function isAdminEmail(email: string | null) {
  return !!email && (env.adminEmails ?? []).includes(email.toLowerCase());
}

async function findByAuthId(authId: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.authId, authId))
    .limit(1);
  return rows.at(0);
}

/**
 * Returns the app user for a Supabase auth identity, creating it on first sign-in.
 * A deleted account returns null: its sign-in can stay valid for up to an hour after
 * deletion, and must not bring the account (or its email) back.
 */
export async function findOrCreateUser(identity: {
  authId: string;
  email: string | null;
  name: string | null;
  phone?: string | null;
  /** Terms version accepted at sign-up, if any. */
  termsVersion?: string | null;
}): Promise<User | null> {
  const db = getDb();
  const existing = await findByAuthId(identity.authId);
  if (existing?.deletedAt) return null;

  if (!existing) {
    await db
      .insert(schema.users)
      .values({
        authId: identity.authId,
        email: identity.email,
        name: identity.name,
        phone: identity.phone ?? null,
        termsVersion: identity.termsVersion ?? null,
        termsAcceptedAt: identity.termsVersion ? new Date() : null,
        role: isAdminEmail(identity.email) ? "admin" : "customer",
      })
      .onConflictDoNothing({ target: schema.users.authId });
    const created = await findByAuthId(identity.authId);
    if (!created) throw new Error("Failed to create user");
    return created;
  }

  const patch: Partial<typeof schema.users.$inferInsert> = {};
  if (identity.email && identity.email !== existing.email) patch.email = identity.email;
  if (identity.name && !existing.name) patch.name = identity.name;
  if (identity.phone && !existing.phone) patch.phone = identity.phone;
  if (identity.termsVersion && !existing.termsAcceptedAt) {
    patch.termsVersion = identity.termsVersion;
    patch.termsAcceptedAt = new Date();
  }
  // The setting only ever promotes to admin; roles given in /admin stay as they are.
  if (existing.role !== "admin" && isAdminEmail(identity.email ?? existing.email)) patch.role = "admin";
  if (Date.now() - existing.lastSignInAt.getTime() > SIGN_IN_TOUCH_MS) {
    patch.lastSignInAt = new Date();
  }
  if (Object.keys(patch).length === 0) return existing;

  const [updated] = await db
    .update(schema.users)
    .set(patch)
    .where(eq(schema.users.id, existing.id))
    .returning();
  return updated;
}
