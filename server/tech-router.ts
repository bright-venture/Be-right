import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { adminQuery, createRouter, technicianQuery, specialistQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  requestEvents,
  requestMedia,
  serviceRequests,
  technicianApplications,
  technicianLocations,
  technicianPresence,
  users,
} from "../db/schema";
import {
  ACTIVE_JOB_STATUSES,
  ASSIGNABLE_STATUSES,
  JOB_PHOTO_KINDS,
  MAX_JOB_PHOTOS,
  VISIT_FEE_REASON_LABEL,
  VISIT_REPORTS,
  type JobPhotoKind,
} from "@contracts/workflow";
import { applyTransition, findRequest, logEvent } from "./lib/workflow";
import { deleteFiles, isOwnUploadKey, mediaExists, profilePhotoUrls, userUploadPrefix } from "./lib/storage";
import { ratingsFor } from "./queries/ratings";
import { notify } from "./notify";
import { audit } from "./lib/audit";
import { isPhotoType } from "@contracts/uploads";
import { isValidPin } from "@contracts/geo";
import { TRANSPORT } from "@contracts/applications";
import { isOnline } from "@contracts/presence";
import { DISTRICTS } from "@contracts/districts";
import { checkWorksIn, OUTSIDE_DISTRICTS_NOTE, requestDistrict } from "./lib/districts";
import { staffScope } from "./lib/serviceSpecialists";
import { LIMITS, rateLimit } from "./lib/rateLimit";

type Db = Parameters<typeof findRequest>[0];

async function jobPhotoCount(db: Db, requestId: number, kind: JobPhotoKind) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(requestMedia)
    .where(and(eq(requestMedia.requestId, requestId), eq(requestMedia.kind, kind)));
  return row?.n ?? 0;
}

/** The technician documents every job: before photos to start work, after photos to complete it. */
const PHOTO_REQUIRED: Record<"start" | "complete", { kind: JobPhotoKind; message: string }> = {
  start: { kind: "before", message: "Add at least one before photo to start the work" },
  complete: { kind: "after", message: "Add at least one after photo to complete the job" },
};

const position = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().max(100_000).optional(),
});

function checkPosition(input: z.infer<typeof position>) {
  if (!isValidPin(input.lat, input.lng)) throw new TRPCError({ code: "BAD_REQUEST", message: "Location unavailable" });
}

const positionValues = (input: z.infer<typeof position>) => ({
  lat: input.lat,
  lng: input.lng,
  accuracy: input.accuracy != null ? Math.round(input.accuracy) : null,
});

export const techRouter = createRouter({
  /**
   * Specialist: technician profiles — contact, photo, trade/area from the
   * application they were hired from, and their workload.
   * (Technicians are only created by hiring an application, never added by email.)
   */
  list: specialistQuery.query(async () => {
    const db = getDb();
    const techs = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        avatar: users.avatar,
        districts: users.districts,
      })
      .from(users)
      .where(eq(users.role, "technician"));
    if (!techs.length) return [];
    const ids = techs.map((x) => x.id);
    const [apps, counts, ratings, photos, presence] = await Promise.all([
      db
        .select({
          id: technicianApplications.id,
          hiredUserId: technicianApplications.hiredUserId,
          trade: technicianApplications.trade,
          area: technicianApplications.area,
          experience: technicianApplications.experience,
          availability: technicianApplications.availability,
          workMode: technicianApplications.workMode,
          companyName: technicianApplications.companyName,
          transport: technicianApplications.transport,
        })
        .from(technicianApplications)
        .where(inArray(technicianApplications.hiredUserId, ids)),
      db
        .select({
          technicianId: serviceRequests.technicianId,
          status: serviceRequests.status,
          n: sql<number>`count(*)::int`,
        })
        .from(serviceRequests)
        .where(inArray(serviceRequests.technicianId, ids))
        .groupBy(serviceRequests.technicianId, serviceRequests.status),
      ratingsFor(ids),
      // Every photo link in one storage call, not one per technician.
      profilePhotoUrls(techs.map((x) => x.avatar)),
      db.select().from(technicianPresence).where(inArray(technicianPresence.technicianId, ids)),
    ]);
    return techs.map((x) => {
        const app = apps.find((a) => a.hiredUserId === x.id);
        const mine = counts.filter((c) => c.technicianId === x.id);
        const sum = (statuses: readonly string[]) =>
          mine.filter((c) => statuses.includes(c.status)).reduce((total, c) => total + c.n, 0);
        return {
          id: x.id,
          name: x.name,
          email: x.email,
          phone: x.phone,
          photoUrl: (x.avatar && photos[x.avatar]) || null,
          applicationId: app?.id ?? null,
          trade: app?.trade ?? null,
          area: app?.area ?? null,
          experience: app?.experience ?? null,
          availability: app?.availability ?? null,
          workMode: app?.workMode ?? null,
          companyName: app?.companyName ?? null,
          transport: app?.transport ?? null,
          online: isOnline(presence.find((row) => row.technicianId === x.id)),
          districts: x.districts,
          activeJobs: sum(ACTIVE_JOB_STATUSES),
          completedJobs: sum(["completed"]),
          rating: ratings.get(x.id) ?? { average: null, count: 0 },
        };
      });
  }),

  /**
   * Admin: turn a technician back into a regular account. Scheduled or in-progress
   * jobs must be reassigned first; approved jobs not yet scheduled go back to
   * "needs a technician" (otherwise they could be scheduled with someone who can't see them).
   */
  remove: adminQuery
    .input(z.object({ technicianId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const unassigned = await getDb().transaction(async (tx) => {
        // Lock this technician's open jobs so nothing is assigned or scheduled meanwhile.
        const jobs = await tx
          .select({ id: serviceRequests.id, status: serviceRequests.status })
          .from(serviceRequests)
          .where(
            and(
              eq(serviceRequests.technicianId, input.technicianId),
              inArray(serviceRequests.status, [...ASSIGNABLE_STATUSES]),
            ),
          )
          .for("update");
        const active = jobs.find((j) => ACTIVE_JOB_STATUSES.includes(j.status));
        if (active) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Reassign job #${active.id} before removing this professional`,
          });
        }
        const tech = await tx.query.users.findFirst({ where: eq(users.id, input.technicianId) });
        const released = jobs.map((j) => j.id);
        if (released.length) {
          await tx.update(serviceRequests).set({ technicianId: null }).where(inArray(serviceRequests.id, released));
          for (const id of released) {
            await logEvent(tx, id, "unassigned", ctx.user.id, `Professional removed: ${tech?.name ?? tech?.email ?? input.technicianId}`);
          }
        }
        await tx
          .update(users)
          .set({ role: "customer" })
          .where(and(eq(users.id, input.technicianId), eq(users.role, "technician")));
        // Reopen any application this account was hired from, so it can be hired again.
        const [reopened] = await tx
          .update(technicianApplications)
          .set({ status: "contacted", hiredUserId: null })
          .where(eq(technicianApplications.hiredUserId, input.technicianId))
          .returning({ id: technicianApplications.id });
        if (tech?.role === "technician") {
          await audit(
            {
              actorId: ctx.user.id,
              action: "technician_removed",
              targetUserId: tech.id,
              applicationId: reopened?.id ?? null,
              details: { unassigned: released.length },
            },
            tx,
          );
        }
        return released;
      });
      return { ok: true, unassigned };
    }),

  /** Technician: am I Available? (The app picks location back up when it opens.) */
  presence: technicianQuery.query(async ({ ctx }) => {
    const row = await getDb().query.technicianPresence.findFirst({ where: eq(technicianPresence.technicianId, ctx.user.id) });
    return { online: isOnline(row), since: row?.availableSince ?? null };
  }),

  /** Technician: go Available. Needs their position: no location, no work offered. */
  goOnline: technicianQuery.input(position).mutation(async ({ ctx, input }) => {
    checkPosition(input);
    const now = new Date();
    const values = { ...positionValues(input), availableSince: now, updatedAt: now };
    await getDb()
      .insert(technicianPresence)
      .values({ technicianId: ctx.user.id, ...values })
      .onConflictDoUpdate({ target: technicianPresence.technicianId, set: values });
    return { ok: true };
  }),

  /** Technician, while Available: where they are now. Refused once they're offline. */
  ping: technicianQuery.input(position).mutation(async ({ ctx, input }) => {
    checkPosition(input);
    const db = getDb();
    const row = await db.query.technicianPresence.findFirst({ where: eq(technicianPresence.technicianId, ctx.user.id) });
    if (!row?.availableSince) throw new TRPCError({ code: "BAD_REQUEST", message: "You're offline" });
    await db
      .update(technicianPresence)
      .set({ ...positionValues(input), updatedAt: new Date() })
      .where(eq(technicianPresence.technicianId, ctx.user.id));
    return { ok: true };
  }),

  /** Technician: go offline. Their position is wiped. */
  goOffline: technicianQuery.mutation(async ({ ctx }) => {
    await getDb()
      .update(technicianPresence)
      .set({ availableSince: null, lat: null, lng: null, accuracy: null, updatedAt: new Date() })
      .where(eq(technicianPresence.technicianId, ctx.user.id));
    return { ok: true };
  }),

  /** Admin: the districts a technician works in (they're only suggested and assigned there). */
  setDistricts: adminQuery
    .input(z.object({ technicianId: z.number().int(), districts: z.array(z.enum(DISTRICTS)).min(1).max(DISTRICTS.length) }))
    .mutation(async ({ ctx, input }) => {
      const districts = DISTRICTS.filter((d) => input.districts.includes(d));
      await getDb().transaction(async (tx) => {
        const [tech] = await tx
          .update(users)
          .set({ districts })
          .where(and(eq(users.id, input.technicianId), eq(users.role, "technician")))
          .returning({ id: users.id });
        if (!tech) throw new TRPCError({ code: "NOT_FOUND", message: "Professional not found" });
        await audit(
          { actorId: ctx.user.id, action: "technician_districts_set", targetUserId: tech.id, details: { districts: districts.join(", ") } },
          tx,
        );
      });
      return { ok: true };
    }),

  /** Admin: how a technician travels. */
  setTransport: adminQuery
    .input(z.object({ technicianId: z.number().int(), transport: z.enum(TRANSPORT) }))
    .mutation(async ({ ctx, input }) => {
      await getDb().transaction(async (tx) => {
        const tech = await tx.query.users.findFirst({
          where: and(eq(users.id, input.technicianId), eq(users.role, "technician")),
        });
        if (!tech) throw new TRPCError({ code: "NOT_FOUND", message: "Professional not found" });
        const changed = await tx
          .update(technicianApplications)
          .set({ transport: input.transport })
          .where(eq(technicianApplications.hiredUserId, tech.id))
          .returning({ id: technicianApplications.id });
        if (!changed.length) throw new TRPCError({ code: "BAD_REQUEST", message: "This professional has no application to update" });
        await audit(
          { actorId: ctx.user.id, action: "technician_transport_set", targetUserId: tech.id, details: { transport: input.transport } },
          tx,
        );
      });
      return { ok: true };
    }),

  /** Admin: assign a technician — only once the customer has approved the quote */
  assign: specialistQuery
    .input(z.object({ requestId: z.number().int(), technicianId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const tech = await db.query.users.findFirst({ where: eq(users.id, input.technicianId) });
      if (!tech || tech.role !== "technician") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a professional" });
      }
      const scope = await staffScope(ctx.user);
      const previousTechnicianId = await db.transaction(async (tx) => {
        const job = await findRequest(tx, input.requestId, scope, true);
        if (!ASSIGNABLE_STATUSES.includes(job.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A professional can be assigned once the customer approves the quote",
          });
        }
        const exception = checkWorksIn(ctx.user.role, tech.districts, requestDistrict(job));
        await tx
          .update(serviceRequests)
          .set({ technicianId: tech.id })
          .where(eq(serviceRequests.id, job.id));
        // The last position belongs to whoever shared it: don't show it under the new name.
        if (job.technicianId !== tech.id) {
          await tx.delete(technicianLocations).where(eq(technicianLocations.requestId, job.id));
        }
        await logEvent(
          tx,
          job.id,
          "assigned",
          ctx.user.id,
          `Professional: ${tech.name ?? tech.email ?? tech.id}${exception ? `, ${OUTSIDE_DISTRICTS_NOTE}` : ""}`,
        );
        return job.technicianId;
      });
      await notify.assigned(input.requestId, previousTechnicianId);
      return { ok: true };
    }),

  /** Technician: my assigned jobs, with the photos the customer uploaded */
  myJobs: technicianQuery.query(async ({ ctx }) => {
    const db = getDb();
    const jobs = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.technicianId, ctx.user.id))
      .orderBy(desc(serviceRequests.createdAt));
    const ids = jobs.map((j) => j.id);
    const [media, arrivals] = jobs.length
      ? await Promise.all([
          db.select().from(requestMedia).where(inArray(requestMedia.requestId, ids)),
          db
            .select({ requestId: requestEvents.requestId })
            .from(requestEvents)
            .where(and(inArray(requestEvents.requestId, ids), eq(requestEvents.status, "arrived"))),
        ])
      : [[], []];
    return jobs.map((job) => ({
      ...job,
      media: media.filter((m) => m.requestId === job.id),
      /** Pressed Arrived: no more "on my way" for this job. */
      arrived: arrivals.some((a) => a.requestId === job.id),
    }));
  }),

  /** Technician: field events — arrived / start work / complete */
  fieldEvent: technicianQuery
    .input(
      z.object({
        requestId: z.number().int(),
        action: z.enum(["arrived", "start", "complete"]),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
        const scope = { technicianId: ctx.user.id };
      if (input.action === "arrived") {
        const job = await findRequest(getDb(), input.requestId, scope);
        if (job.status !== "scheduled") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Job is not scheduled" });
        }
        await logEvent(getDb(), job.id, "arrived", ctx.user.id, input.note);
        // There now: the customer stops seeing them on the map.
        await getDb().delete(technicianLocations).where(eq(technicianLocations.requestId, job.id));
        await notify.arrived(job.id);
      } else {
        const required = PHOTO_REQUIRED[input.action];
        if ((await jobPhotoCount(getDb(), input.requestId, required.kind)) === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: required.message });
        }
        await applyTransition({
          id: input.requestId,
          name: input.action === "start" ? "startWork" : "complete",
          actorId: ctx.user.id,
          scope,
          note: input.note,
        });
        if (input.action === "start") {
          await getDb().delete(technicianLocations).where(eq(technicianLocations.requestId, input.requestId));
        }
        if (input.action === "complete") await notify.completed(input.requestId);
      }
      return { ok: true };
    }),

  /**
   * Technician: attach uploaded before/after photos to a job under way. Before photos
   * can be taken from the moment the visit is scheduled; after photos once work started.
   */
  addJobPhotos: technicianQuery
    .input(
      z.object({
        requestId: z.number().int(),
        kind: z.enum(JOB_PHOTO_KINDS),
        photos: z
          .array(
            z.object({
              key: z.string().max(512),
              fileName: z.string().max(512),
              size: z.number().int().nonnegative(),
              contentType: z.string().max(128),
            }),
          )
          .min(1)
          .max(MAX_JOB_PHOTOS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.photos.some((m) => !isOwnUploadKey(ctx.user.authId, m.key) || !isPhotoType(m.contentType))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid photo" });
      }
      if (!(await mediaExists(input.photos.map((m) => m.key)))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A photo didn't finish uploading, please try again" });
      }
      await getDb().transaction(async (tx) => {
        const job = await findRequest(tx, input.requestId, { technicianId: ctx.user.id }, true);
        const open = input.kind === "before" ? ACTIVE_JOB_STATUSES.includes(job.status) : job.status === "in_progress";
        if (!open) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: input.kind === "before" ? "Job is not active" : "Start the work before adding after photos",
          });
        }
        if ((await jobPhotoCount(tx, job.id, input.kind)) + input.photos.length > MAX_JOB_PHOTOS) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Up to ${MAX_JOB_PHOTOS} ${input.kind} photos per job` });
        }
        await tx.insert(requestMedia).values(
          input.photos.map((m) => ({
            requestId: job.id,
            key: m.key,
            fileName: m.fileName,
            size: m.size,
            contentType: m.contentType,
            kind: input.kind,
          })),
        );
      });
      return { ok: true };
    }),

  /** Technician: take back one of their own before/after photos while the job is still open. */
  removeJobPhoto: technicianQuery
    .input(z.object({ requestId: z.number().int(), key: z.string().max(512) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const job = await findRequest(db, input.requestId, { technicianId: ctx.user.id });
      if (!ACTIVE_JOB_STATUSES.includes(job.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job is not active" });
      }
      const removed = await db
        .delete(requestMedia)
        .where(
          and(
            eq(requestMedia.requestId, job.id),
            eq(requestMedia.key, input.key),
            inArray(requestMedia.kind, [...JOB_PHOTO_KINDS]),
            // Only the technician's own uploads, never the customer's photos.
            sql`${requestMedia.key} like ${userUploadPrefix(ctx.user.authId) + "%"}`,
          ),
        )
        .returning({ key: requestMedia.key });
      if (!removed.length) throw new TRPCError({ code: "NOT_FOUND" });
      await deleteFiles("media", [input.key]);
      return { ok: true };
    }),

  /** Technician: no repair at this visit (no work needed or declined, or nobody there). */
  reportVisit: technicianQuery
    .input(
      z.object({
        requestId: z.number().int(),
        reason: z.enum(VISIT_REPORTS),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const job = await findRequest(db, input.requestId, { technicianId: ctx.user.id });
      if (!ACTIVE_JOB_STATUSES.includes(job.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job is not active" });
      }
      // Each report emails every specialist: a few per job is plenty.
      await rateLimit(`visit-report:${ctx.user.id}:${job.id}`, LIMITS.visitReportPerJob);
      const note = [VISIT_FEE_REASON_LABEL[input.reason], input.note].filter(Boolean).join(". ");
      await logEvent(db, job.id, "visit_report", ctx.user.id, note);
      await notify.visitReported(job.id, note);
      return { ok: true };
    }),

  /** Technician, on the way to a job ("On my way"): where they are, for that job's customer. */
  reportLocation: technicianQuery
    .input(
      z.object({
        requestId: z.number().int(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().nonnegative().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
        const db = getDb();
      const job = await findRequest(db, input.requestId, { technicianId: ctx.user.id });
      // Only on the way: scheduled, and not arrived yet (then the customer stops seeing them).
      const [arrived] = await db
        .select({ id: requestEvents.id })
        .from(requestEvents)
        .where(and(eq(requestEvents.requestId, job.id), eq(requestEvents.status, "arrived")))
        .limit(1);
      if (job.status !== "scheduled" || arrived) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not on the way to this job" });
      }
      const values = {
        requestId: job.id,
        technicianId: ctx.user.id,
        lat: String(input.lat),
        lng: String(input.lng),
        accuracy: input.accuracy != null ? String(Math.round(input.accuracy)) : null,
        updatedAt: new Date(),
      };
      const [saved] = await db
        .insert(technicianLocations)
        .values(values)
        .onConflictDoUpdate({ target: technicianLocations.requestId, set: values })
        // xmax = 0: a new row, i.e. the first position for this job: they just set off.
        .returning({ first: sql<boolean>`xmax = 0` });
      if (saved?.first) await notify.onTheWay(job.id);
      return { ok: true };
    }),
});
