import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { adminQuery, createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { serviceRequests, technicianApplications, users } from "../db/schema";
import { CATEGORIES } from "../contracts/services";
import {
  APPLICATION_DOCUMENTS,
  DOCUMENT_FIELD,
  EXPERIENCE_LEVELS,
  MANUAL_APPLICATION_STATUSES,
  WORK_MODES,
  OFFICE_DOCUMENTS,
  officeDocuments,
  TRANSPORT,
  type ApplicationDocument,
} from "@contracts/applications";
import { getSupabaseAdmin } from "./lib/supabase";
import { LEGAL_VERSION } from "@contracts/legal";
import { isValidPhone } from "@contracts/phone";
import { clientIp, LIMITS, rateLimit } from "./lib/rateLimit";
import { notify } from "./notify";
import { createDocumentUrls, documentKeyMatches, documentsExist } from "./lib/storage";
import { audit, auditDocumentsViewed } from "./lib/audit";
import { saveInvitedAccount } from "./lib/invites";

const TRADE_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];
const documentKey = z.string().max(512);

/** An application's document keys, by document (null when missing). */
function documentKeysOf(app: Record<(typeof DOCUMENT_FIELD)[ApplicationDocument], string | null>) {
  return Object.fromEntries(APPLICATION_DOCUMENTS.map((kind) => [kind, app[DOCUMENT_FIELD[kind]]])) as Record<
    ApplicationDocument,
    string | null
  >;
}
const email = z.string().trim().toLowerCase().email().max(320);
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
/**
 * An application. Only admins review applications: they call the applicant, meet them in
 * person, then accept (which adds them to the technicians) or reject. Specialists only see technicians.
 */
async function findApplication(id: number) {
  const app = await getDb().query.technicianApplications.findFirst({ where: eq(technicianApplications.id, id) });
  if (!app) throw new TRPCError({ code: "NOT_FOUND" });
  return app;
}
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
        hasTools: z.boolean(),
        workMode: z.enum(WORK_MODES),
        // Required when they work with a company.
        companyName: z.string().trim().max(255).optional(),
        transport: z.enum(TRANSPORT),
        // The profile photo, uploaded first via storage.createDocumentUpload.
        photoKey: documentKey,
        // Yes or no for each paper they will bring to the office (the vehicle's only with a vehicle).
        documents: z.object(Object.fromEntries(OFFICE_DOCUMENTS.map((kind) => [kind, z.boolean().optional()])) as Record<
          (typeof OFFICE_DOCUMENTS)[number],
          z.ZodOptional<z.ZodBoolean>
        >),
        // Privacy Policy.
        consent: z.literal(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.workMode === "company" && (input.companyName ?? "").length < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please give the company's name" });
      }
      await rateLimit(`apply:ip:${clientIp(ctx.req)}`, LIMITS.applicationPerIp);
      // The photo must be a real upload made for the photo.
      if (!documentKeyMatches(input.photoKey, "photo") || !(await documentsExist([input.photoKey]))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please upload your photo" });
      }
      const asked = officeDocuments(input.transport);
      if (asked.some((kind) => input.documents[kind] === undefined)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please answer yes or no for each document" });
      }
      const documentsDeclared = Object.fromEntries(asked.map((kind) => [kind, input.documents[kind]!]));
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
          hasTools: input.hasTools,
          workMode: input.workMode,
          companyName: input.workMode === "company" ? input.companyName : null,
          hasTransport: input.transport !== "none",
          transport: input.transport,
          photoKey: input.photoKey,
          documentsDeclared,
          consentAt: new Date(),
          consentVersion: LEGAL_VERSION,
        })
        .returning({ id: technicianApplications.id });
      await notify.applicationSubmitted(res.id);
      return { id: res.id };
    }),

  /** Every application, newest first (admins only). */
  list: adminQuery.query(() =>
    getDb().select().from(technicianApplications).orderBy(desc(technicianApplications.createdAt)),
  ),

  setStatus: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(MANUAL_APPLICATION_STATUSES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const app = await findApplication(input.id);
      // A hired technician's application stays hired: "rejected" would start the deletion of
      // the documents of someone who's working (and "Hire" would show again).
      if (app.status === "hired") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This technician is hired. To stop working with them, remove them in Technicians.",
        });
      }
      await db
        .update(technicianApplications)
        // Rejection starts the document-retention clock; un-rejecting stops it.
        .set({ status: input.status, rejectedAt: input.status === "rejected" ? new Date() : null })
        // Checked again here, in case it was hired in the meantime.
        .where(and(eq(technicianApplications.id, input.id), ne(technicianApplications.status, "hired")));
      if (app.status !== input.status) {
        await audit({
          actorId: ctx.user.id,
          action: "application_status",
          applicationId: app.id,
          details: { from: app.status, to: input.status },
        });
      }
      return { ok: true };
    }),

  /** Short-lived links to an applicant's documents (admins only). Every visit is recorded. */
  documents: adminQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const app = await findApplication(input.id);
    // Recorded before any link is handed out: no record, no documents.
    await auditDocumentsViewed(ctx.user.id, app.id);
    // What this application has on file: the photo, and the papers of older applications.
    const keys = documentKeysOf(app);
    const kinds = APPLICATION_DOCUMENTS.filter((kind) => !!keys[kind]);
    const urls = await createDocumentUrls(kinds.map((kind) => keys[kind]).filter((k): k is string => !!k));
    const link = (key: string | null) =>
      key && urls[key] ? { url: urls[key], isPdf: key.toLowerCase().endsWith(".pdf") } : null;
    return Object.fromEntries(kinds.map((kind) => [kind, link(keys[kind])])) as Partial<
      Record<ApplicationDocument, { url: string; isPdf: boolean } | null>
    >;
  }),

  /** Before hiring: does this email already belong to an account? (shown in the confirmation) */
  hireCheck: adminQuery.input(z.object({ email })).query(async ({ input }) => {
    const db = getDb();
    const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (!existing) return { existing: null };
    const bookings = await db.$count(serviceRequests, eq(serviceRequests.userId, existing.id));
    return { existing: { name: existing.name, role: existing.role, bookings } };
  }),

  /**
   * Accept an applicant after meeting them (admins only): they join the technicians, so the
   * specialists can assign them jobs. An existing account becomes a technician right away;
   * otherwise they're invited by email and their technician account is created now.
   */
  hire: adminQuery
    .input(z.object({ id: z.number().int().positive(), email: email.optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const app = await findApplication(input.id);
      if (app.status === "hired" && app.hiredUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This applicant is already a technician" });
      }
      const address = input.email ?? app.email?.toLowerCase();
      if (!address) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add the applicant's email to hire them" });
      }

      const existing = await db.query.users.findFirst({ where: eq(users.email, address) });
      if (existing?.role === "specialist" || existing?.role === "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This email belongs to a Be Right staff member" });
      }

      /** The technician account, the application and the audit line: saved together or not at all. */
      const hireAs = (invited: boolean, saveAccount: (tx: Tx) => Promise<number>) =>
        db.transaction(async (tx) => {
          const userId = await saveAccount(tx);
          await tx
            .update(technicianApplications)
            .set({ status: "hired", hiredUserId: userId, email: address, approvedAt: new Date(), approvedBy: ctx.user.id })
            .where(eq(technicianApplications.id, app.id));
          await audit(
            {
              actorId: ctx.user.id,
              action: "technician_hired",
              targetUserId: userId,
              applicationId: app.id,
              details: { email: address, invited },
            },
            tx,
          );
        });

      if (existing) {
        await hireAs(false, async (tx) => {
          await tx
            .update(users)
            .set({
              role: "technician",
              phone: existing.phone ?? app.phone,
              name: existing.name ?? app.name,
              avatar: app.photoKey,
            })
            .where(eq(users.id, existing.id));
          return existing.id;
        });
        await notify.technicianJoined(app.id);
        return { ok: true, invited: false, email: address };
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
        const invitedId = data.user.id;
        await saveInvitedAccount(invitedId, () =>
          hireAs(true, async (tx) => {
            const [created] = await tx
              .insert(users)
              .values({
                authId: invitedId,
                email: address,
                name: app.name,
                phone: app.phone,
                role: "technician",
                avatar: app.photoKey,
              })
              .onConflictDoUpdate({ target: users.authId, set: { role: "technician", avatar: app.photoKey } })
              .returning({ id: users.id });
            return created.id;
          }),
        );
        await notify.technicianJoined(app.id);
        return { ok: true, invited: true, email: address };
      }
    }),
});
