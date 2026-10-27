import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { createRouter, authedQuery, customerQuery, publicQuery, staffSessionProblem, technicianQuery } from "./middleware";
import {
  createDocumentUploadUrl,
  createSignedUrls,
  createUploadUrl,
  MAX_UPLOAD_BYTES,
} from "./lib/storage";
import {
  APPLICATION_DOCUMENTS,
  isAllowedDocumentType,
  MAX_DOCUMENT_BYTES,
} from "@contracts/applications";
import { getDb } from "./queries/connection";
import { clientIp, LIMITS, rateLimit } from "./lib/rateLimit";
import { requestMedia, serviceRequests } from "../db/schema";
import { ACTIVE_JOB_STATUSES } from "@contracts/workflow";
import { findRequest } from "./lib/workflow";
import { canDispatch } from "@contracts/roles";
import { servicesOf } from "./lib/serviceSpecialists";
import { isMediaType, isPhotoType } from "@contracts/uploads";

export const storageRouter = createRouter({
  // Returns a one-time signed URL token; the browser uploads the file directly to storage.
  createUpload: customerQuery
    .input(
      z.object({
        fileName: z.string().min(1).max(512),
        size: z.number().int().positive(),
        contentType: z.string().max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.size > MAX_UPLOAD_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 20 MB)" });
      }
      if (!isMediaType(input.contentType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only photos and videos are allowed" });
      }
      await rateLimit(`media-upload:user:${ctx.user.id}`, LIMITS.mediaUploadPerUser);
      return createUploadUrl(ctx.user.authId, input.fileName);
    }),

  // The assigned technician's before/after photos of a job that's under way.
  createJobUpload: technicianQuery
    .input(
      z.object({
        requestId: z.number().int(),
        fileName: z.string().min(1).max(512),
        size: z.number().int().positive(),
        contentType: z.string().max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.size > MAX_UPLOAD_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 20 MB)" });
      }
      if (!isPhotoType(input.contentType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only photos are allowed" });
      }
      const job = await findRequest(getDb(), input.requestId, { technicianId: ctx.user.id });
      if (!ACTIVE_JOB_STATUSES.includes(job.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job is not active" });
      }
      await rateLimit(`media-upload:user:${ctx.user.id}`, LIMITS.mediaUploadPerUser);
      return createUploadUrl(ctx.user.authId, input.fileName);
    }),

  // Technician applicants (no account yet) upload their four documents.
  createDocumentUpload: publicQuery
    .input(
      z.object({
        kind: z.enum(APPLICATION_DOCUMENTS),
        fileName: z.string().min(1).max(512),
        size: z.number().int().positive(),
        contentType: z.string().max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.size > MAX_DOCUMENT_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "File too large (max 10 MB)" });
      }
      if (!isAllowedDocumentType(input.kind, input.contentType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This file type isn't accepted" });
      }
      // No account here, so cap per IP and in total; unused uploads are deleted after a day.
      await rateLimit(`doc-upload:ip:${clientIp(ctx.req)}`, LIMITS.documentUploadPerIp);
      await rateLimit("doc-upload:all", LIMITS.documentUploadPerDay);
      return createDocumentUploadUrl(input.kind, input.fileName);
    }),

  // Batch signed URLs — only for media on requests the caller owns or is assigned to, or staff
  // who handle them (admins: all; a specialist: their services).
  urls: authedQuery
    .input(z.object({ keys: z.array(z.string()).max(16) }))
    .query(async ({ ctx, input }) => {
      if (!input.keys.length) return { urls: {} as Record<string, string> };
      const db = getDb();
      const rows = await db
        .select({
          key: requestMedia.key,
          ownerId: serviceRequests.userId,
          technicianId: serviceRequests.technicianId,
          category: serviceRequests.category,
        })
        .from(requestMedia)
        .innerJoin(serviceRequests, eq(requestMedia.requestId, serviceRequests.id))
        .where(inArray(requestMedia.key, input.keys));
      const staff = canDispatch(ctx.user.role) && !staffSessionProblem(ctx);
      const mine = staff && ctx.user.role !== "admin" ? await servicesOf(ctx.user.id) : null;
      const allowed = rows
        .filter(
          (r) =>
            r.ownerId === ctx.user.id ||
            r.technicianId === ctx.user.id ||
            (staff && (mine === null || mine.includes(r.category))),
        )
        .map((r) => r.key);
      return { urls: await createSignedUrls(allowed) };
    }),
});
