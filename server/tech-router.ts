import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createRouter, technicianQuery, specialistQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  requestMedia,
  serviceRequests,
  technicianApplications,
  technicianLocations,
  users,
} from "../db/schema";
import { ACTIVE_JOB_STATUSES, ASSIGNABLE_STATUSES } from "@contracts/workflow";
import { applyTransition, findRequest, logEvent } from "./lib/workflow";
import { profilePhotoUrl } from "./lib/storage";
import { ratingsFor } from "./queries/ratings";
import { notify } from "./notify";

export const techRouter = createRouter({
  /**
   * Specialist: technician profiles — contact, photo, trade/area from the
   * application they were hired from, and their workload.
   * (Technicians are only created by hiring an application, never added by email.)
   */
  list: specialistQuery.query(async () => {
    const db = getDb();
    const techs = await db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, avatar: users.avatar })
      .from(users)
      .where(eq(users.role, "technician"));
    if (!techs.length) return [];
    const ids = techs.map((x) => x.id);
    const [apps, counts, ratings] = await Promise.all([
      db
        .select({
          id: technicianApplications.id,
          hiredUserId: technicianApplications.hiredUserId,
          trade: technicianApplications.trade,
          area: technicianApplications.area,
          experience: technicianApplications.experience,
          availability: technicianApplications.availability,
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
    ]);
    return Promise.all(
      techs.map(async (x) => {
        const app = apps.find((a) => a.hiredUserId === x.id);
        const mine = counts.filter((c) => c.technicianId === x.id);
        const sum = (statuses: readonly string[]) =>
          mine.filter((c) => statuses.includes(c.status)).reduce((total, c) => total + c.n, 0);
        return {
          id: x.id,
          name: x.name,
          email: x.email,
          phone: x.phone,
          photoUrl: await profilePhotoUrl(x.avatar),
          applicationId: app?.id ?? null,
          trade: app?.trade ?? null,
          area: app?.area ?? null,
          experience: app?.experience ?? null,
          availability: app?.availability ?? null,
          activeJobs: sum(ACTIVE_JOB_STATUSES),
          completedJobs: sum(["completed"]),
          rating: ratings.get(x.id) ?? { average: null, count: 0 },
        };
      }),
    );
  }),

  /**
   * Admin: turn a technician back into a regular account. Scheduled or in-progress
   * jobs must be reassigned first; approved jobs not yet scheduled go back to
   * "needs a technician" (otherwise they could be scheduled with someone who can't see them).
   */
  remove: specialistQuery
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
            message: `Reassign job #${active.id} before removing this technician`,
          });
        }
        const tech = await tx.query.users.findFirst({ where: eq(users.id, input.technicianId) });
        const released = jobs.map((j) => j.id);
        if (released.length) {
          await tx.update(serviceRequests).set({ technicianId: null }).where(inArray(serviceRequests.id, released));
          for (const id of released) {
            await logEvent(tx, id, "unassigned", ctx.user.id, `Technician removed: ${tech?.name ?? tech?.email ?? input.technicianId}`);
          }
        }
        await tx
          .update(users)
          .set({ role: "customer" })
          .where(and(eq(users.id, input.technicianId), eq(users.role, "technician")));
        // Reopen any application this account was hired from, so it can be hired again.
        await tx
          .update(technicianApplications)
          .set({ status: "contacted", hiredUserId: null })
          .where(eq(technicianApplications.hiredUserId, input.technicianId));
        return released;
      });
      return { ok: true, unassigned };
    }),

  /** Admin: assign a technician — only once the customer has approved the quote */
  assign: specialistQuery
    .input(z.object({ requestId: z.number().int(), technicianId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const tech = await db.query.users.findFirst({ where: eq(users.id, input.technicianId) });
      if (!tech || tech.role !== "technician") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a technician" });
      }
      const previousTechnicianId = await db.transaction(async (tx) => {
        const job = await findRequest(tx, input.requestId, "any", true);
        if (!ASSIGNABLE_STATUSES.includes(job.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A technician can be assigned once the customer approves the quote",
          });
        }
        await tx
          .update(serviceRequests)
          .set({ technicianId: tech.id })
          .where(eq(serviceRequests.id, job.id));
        // The last position belongs to whoever shared it: don't show it under the new name.
        if (job.technicianId !== tech.id) {
          await tx.delete(technicianLocations).where(eq(technicianLocations.requestId, job.id));
        }
        await logEvent(tx, job.id, "assigned", ctx.user.id, `Technician: ${tech.name ?? tech.email ?? tech.id}`);
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
    const media = jobs.length
      ? await db
          .select()
          .from(requestMedia)
          .where(inArray(requestMedia.requestId, jobs.map((j) => j.id)))
      : [];
    return jobs.map((job) => ({ ...job, media: media.filter((m) => m.requestId === job.id) }));
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
      } else {
        await applyTransition({
          id: input.requestId,
          name: input.action === "start" ? "startWork" : "complete",
          actorId: ctx.user.id,
          scope,
          note: input.note,
        });
        if (input.action === "complete") await notify.completed(input.requestId);
      }
      return { ok: true };
    }),

  /** Technician: report current position for an active job */
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
      if (!ACTIVE_JOB_STATUSES.includes(job.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job is not active" });
      }
      const values = {
        requestId: job.id,
        technicianId: ctx.user.id,
        lat: String(input.lat),
        lng: String(input.lng),
        accuracy: input.accuracy != null ? String(Math.round(input.accuracy)) : null,
        updatedAt: new Date(),
      };
      await db
        .insert(technicianLocations)
        .values(values)
        .onConflictDoUpdate({ target: technicianLocations.requestId, set: values });
      return { ok: true };
    }),
});
