import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { createRouter, publicQuery, specialistQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { serviceRequests, technicianApplications, users } from "../db/schema";
import { CATEGORIES } from "../contracts/services";
import {
  APPLICATION_DOCUMENTS,
  AVAILABILITY,
  DOCUMENT_FIELD,
  EXPERIENCE_LEVELS,
  MANUAL_APPLICATION_STATUSES,
  TRANSPORT,
  type ApplicationDocument,
} from "@contracts/applications";
import { getSupabaseAdmin } from "./lib/supabase";
import { LEGAL_VERSION } from "@contracts/legal";
import { isValidPhone } from "@contracts/phone";
import { clientIp, LIMITS, rateLimit } from "./lib/rateLimit";
import { notify } from "./notify";
import { createDocumentUrls, documentKeyMatches, documentsExist } from "./lib/storage";

const TRADE_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];
const documentKey = z.string().max(512);

/** An application's four document keys, by document (null when missing). */
function documentKeysOf(app: Record<(typeof DOCUMENT_FIELD)[ApplicationDocument], string | null>) {
  return Object.fromEntries(APPLICATION_DOCUMENTS.map((kind) => [kind, app[DOCUMENT_FIELD[kind]]])) as Record<
    ApplicationDocument,
    string | null
  >;
}
const email = z.string().trim().toLowerCase().email().max(320);

/** Where the invitation link lands: set a password, then the technician's jobs page. */
function inviteRedirect(req: Request) {
  const origin = req.headers.get("origin") ?? process.env.SITE_URL;
  return origin && /^https?:\/\//.test(origin)
    ? `${origin}/reset-password?next=${encodeURIComponent("/tech")}&welcome=1`
    : undefined; // Supabase falls back to the project's Site URL
}

export const joinRouter = createRouter({
  // Public — technicians apply without an account.
  submit: publicQuery
    .input(
      z.object({
        name: z.string().trim().min(2).max(255),
        phone: z.string().trim().max(64).refine(isValidPhone, "Invalid phone number"),
        email,
        trade: z.enum(TRADE_IDS),
        area: z.string().trim().min(2).max(255),
        experience: z.enum(EXPERIENCE_LEVELS),
        availability: z.enum(AVAILABILITY),
        hasTools: z.boolean(),
        transport: z.enum(TRANSPORT),
        // Every field is required, including what the applicant tells us about their work.
        notes: z.string().trim().min(3).max(2000),
        // Mandatory documents, uploaded first via storage.createDocumentUpload.
        idDocumentKey: documentKey,
        criminalRecordKey: documentKey,
        proofOfAddressKey: documentKey,
        photoKey: documentKey,
        // Privacy Policy + consent to review the documents.
        consent: z.literal(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await rateLimit(`apply:ip:${clientIp(ctx.req)}`, LIMITS.applicationPerIp);
      // Each key must be a real upload of the right kind (not, say, the photo sent as the ID).
      const keys = APPLICATION_DOCUMENTS.map((kind) => input[DOCUMENT_FIELD[kind]]);
      if (
        APPLICATION_DOCUMENTS.some((kind) => !documentKeyMatches(input[DOCUMENT_FIELD[kind]], kind)) ||
        !(await documentsExist(keys))
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please upload all four documents" });
      }
      // \`consent\` is validated above (must be true); what's stored is when and which version.
      const [res] = await getDb()
        .insert(technicianApplications)
        .values({
          name: input.name,
          phone: input.phone,
          email: input.email,
          trade: input.trade,
          area: input.area,
          experience: input.experience,
          availability: input.availability,
          hasTools: input.hasTools,
          hasTransport: input.transport !== "none",
          transport: input.transport,
          notes: input.notes ?? null,
          idDocumentKey: input.idDocumentKey,
          criminalRecordKey: input.criminalRecordKey,
          proofOfAddressKey: input.proofOfAddressKey,
          photoKey: input.photoKey,
          consentAt: new Date(),
          consentVersion: LEGAL_VERSION,
        })
        .returning({ id: technicianApplications.id });
      await notify.applicationSubmitted(res.id);
      return { id: res.id };
    }),

  list: specialistQuery.query(async () => {
    return getDb()
      .select()
      .from(technicianApplications)
      .orderBy(desc(technicianApplications.createdAt));
  }),

  setStatus: specialistQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(MANUAL_APPLICATION_STATUSES),
      }),
    )
    .mutation(async ({ input }) => {
      await getDb()
        .update(technicianApplications)
        // Rejection starts the document-retention clock; un-rejecting stops it.
        .set({ status: input.status, rejectedAt: input.status === "rejected" ? new Date() : null })
        .where(eq(technicianApplications.id, input.id));
      return { ok: true };
    }),

  /** Short-lived links to an applicant's documents (specialists only). */
  documents: specialistQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const app = await getDb().query.technicianApplications.findFirst({
      where: eq(technicianApplications.id, input.id),
    });
    if (!app) throw new TRPCError({ code: "NOT_FOUND" });
    const keys = documentKeysOf(app);
    const urls = await createDocumentUrls(Object.values(keys).filter((k): k is string => !!k));
    const link = (key: string | null) =>
      key && urls[key] ? { url: urls[key], isPdf: key.toLowerCase().endsWith(".pdf") } : null;
    return Object.fromEntries(APPLICATION_DOCUMENTS.map((kind) => [kind, link(keys[kind])])) as Record<
      ApplicationDocument,
      { url: string; isPdf: boolean } | null
    >;
  }),

  /** Before hiring: does this email already belong to an account? (shown in the confirmation) */
  hireCheck: specialistQuery.input(z.object({ email })).query(async ({ input }) => {
    const db = getDb();
    const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (!existing) return { existing: null };
    const bookings = await db.$count(serviceRequests, eq(serviceRequests.userId, existing.id));
    return { existing: { name: existing.name, role: existing.role, bookings } };
  }),

  /**
   * Hire an applicant: an existing account becomes a technician right away;
   * otherwise they're invited by email and their technician account is created now,
   * so they can be assigned jobs immediately.
   */
  hire: specialistQuery
    .input(z.object({ id: z.number().int().positive(), email: email.optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const app = await db.query.technicianApplications.findFirst({
        where: eq(technicianApplications.id, input.id),
      });
      if (!app) throw new TRPCError({ code: "NOT_FOUND" });
      if (Object.values(documentKeysOf(app)).some((key) => !key)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "All four documents are required. Ask the applicant to apply again with them.",
        });
      }
      const address = input.email ?? app.email?.toLowerCase();
      if (!address) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add the applicant's email to hire them" });
      }

      let userId: number;
      let invited = false;
      const existing = await db.query.users.findFirst({ where: eq(users.email, address) });
      if (existing) {
        if (existing.role === "specialist") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This email belongs to a specialist" });
        }
        await db
          .update(users)
          .set({
            role: "technician",
            phone: existing.phone ?? app.phone,
            name: existing.name ?? app.name,
            avatar: app.photoKey,
          })
          .where(eq(users.id, existing.id));
        userId = existing.id;
      } else {
        const { data, error } = await getSupabaseAdmin().auth.admin.inviteUserByEmail(address, {
          data: { full_name: app.name, phone: app.phone },
          redirectTo: inviteRedirect(ctx.req),
        });
        if (error || !data.user) {
          const already = error && /already|registered|exists/i.test(error.message);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: already
              ? "This email already has a login. Ask them to sign in once, then hire again."
              : `Could not send the invitation: ${error?.message ?? "unknown error"}`,
          });
        }
        const [created] = await db
          .insert(users)
          .values({
            authId: data.user.id,
            email: address,
            name: app.name,
            phone: app.phone,
            role: "technician",
            avatar: app.photoKey,
          })
          .onConflictDoUpdate({ target: users.authId, set: { role: "technician", avatar: app.photoKey } })
          .returning({ id: users.id });
        userId = created.id;
        invited = true;
      }

      await db
        .update(technicianApplications)
        .set({ status: "hired", hiredUserId: userId, email: address })
        .where(eq(technicianApplications.id, app.id));
      return { ok: true, invited, email: address };
    }),
});
