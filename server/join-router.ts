import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { adminQuery, createRouter, publicQuery } from "./middleware";
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
  requiredDocuments,
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
 * An application. Only admins review applications: they meet the applicant in person, then
 * approve (which adds them to the technicians) or reject. Specialists only see technicians.
 */
async function findApplication(id: number) {
  const app = await getDb().query.technicianApplications.findFirst({ where: eq(technicianApplications.id, id) });
  if (!app) throw new TRPCError({ code: "NOT_FOUND" });
  return app;
}
const isOpen = (status: string) => status !== "hired" && status !== "rejected";

/** Whether every document the application needs was uploaded. */
function documentsOnFile(app: Parameters<typeof documentKeysOf>[0] & { transport: (typeof TRANSPORT)[number] | null }) {
  const keys = documentKeysOf(app);
  return requiredDocuments(app.transport).every((kind) => !!keys[kind]);
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
        availability: z.enum(AVAILABILITY),
        hasTools: z.boolean(),
        transport: z.enum(TRANSPORT),
        // Every field is required, including what the applicant tells us about their work.
        notes: z.string().trim().min(3).max(2000),
        // Mandatory documents, uploaded first via storage.createDocumentUpload.
        idDocumentKey: documentKey,
        criminalRecordKey: documentKey,
        proofOfAddressKey: documentKey,
        // Required when the applicant works with a vehicle (transport other than "none").
        vehicleRegistrationKey: documentKey.optional(),
        photoKey: documentKey,
        // Privacy Policy + consent to review the documents.
        consent: z.literal(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await rateLimit(`apply:ip:${clientIp(ctx.req)}`, LIMITS.applicationPerIp);
      // Each required key must be a real upload of the right kind (not, say, the photo sent as the ID).
      const required = requiredDocuments(input.transport);
      const keys = required.map((kind) => input[DOCUMENT_FIELD[kind]]);
      if (
        required.some((kind) => !documentKeyMatches(input[DOCUMENT_FIELD[kind]] ?? "", kind)) ||
        !(await documentsExist(keys as string[]))
      ) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please upload every required document" });
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
          vehicleRegistrationKey: required.includes("vehicleRegistration") ? input.vehicleRegistrationKey : null,
          photoKey: input.photoKey,
          consentAt: new Date(),
          consentVersion: LEGAL_VERSION,
        })
        .returning({ id: technicianApplications.id });
      await notify.applicationSubmitted(res.id);
      return { id: res.id };
    }),

  /** Every application, newest first (admins only). */
  list: adminQuery.query(async () => {
    const rows = await getDb().select().from(technicianApplications).orderBy(desc(technicianApplications.createdAt));
    return rows.map((app) => ({ ...app, documentsOnFile: documentsOnFile(app) }));
  }),

  /**
   * Book (or move) the in-person meeting at the office. The applicant gets the date, time and
   * place by email. After meeting them, an admin approves or rejects.
   */
  bookMeeting: adminQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        at: z.date(),
        place: z.string().trim().min(3).max(200),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const app = await findApplication(input.id);
      if (!isOpen(app.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only an open application can have a meeting" });
      }
      if (input.at.getTime() < Date.now() - 60 * 60_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a date and time that hasn't passed" });
      }
      const rescheduled = !!app.meetingAt;
      await getDb()
        .update(technicianApplications)
        .set({
          meetingAt: input.at,
          meetingPlace: input.place,
          meetingNote: input.note || null,
          // Booking a meeting means they were contacted.
          status: app.status === "new" ? "contacted" : app.status,
        })
        .where(eq(technicianApplications.id, app.id));
      await audit({
        actorId: ctx.user.id,
        action: "meeting_booked",
        applicationId: app.id,
        details: { at: input.at.toISOString(), place: input.place, rescheduled },
      });
      await notify.meetingBooked(app.id, rescheduled);
      return { ok: true, emailed: !!app.email };
    }),

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
    const kinds = requiredDocuments(app.transport);
    const keys = documentKeysOf(app);
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
   * Approve an applicant after meeting them (admins only): they join the technicians, so the
   * specialists can assign them jobs. An existing account becomes a technician right away;
   * otherwise they're invited by email and their technician account is created now.
   */
  hire: adminQuery
    .input(z.object({ id: z.number().int().positive(), email: email.optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const app = await findApplication(input.id);
      if (!app.meetingAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Book a meeting with the applicant before approving" });
      }
      const keysOnFile = documentKeysOf(app);
      if (requiredDocuments(app.transport).some((kind) => !keysOnFile[kind])) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Every required document is needed. Ask the applicant to apply again with them.",
        });
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
