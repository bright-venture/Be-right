import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { STAFF_PASSWORD_REQUIRED, STAFF_TWO_STEP_REQUIRED, type Role } from "@contracts/roles";
import { auditStaffRefusal } from "./lib/audit";
import { alertServerError } from "./lib/alerts";

/**
 * Stack traces only on a developer's machine. Opt-in rather than "not production":
 * hosts like Netlify don't set NODE_ENV, and the default then leaked them publicly.
 */
const showInternals = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  isDev: showInternals,
  errorFormatter({ shape, error }) {
    // An unexpected crash (database, storage, a bug) arrives wrapped with its cause; its
    // message can expose SQL or provider details, so visitors get a generic one instead.
    // Errors thrown on purpose (TRPCError without a cause) keep their readable message.
    if (!showInternals && error.code === "INTERNAL_SERVER_ERROR" && error.cause) {
      return { ...shape, message: "Something went wrong on our side. Please try again." };
    }
    return shape;
  },
});

export const createRouter = t.router;

/** Unexpected errors (not ones thrown on purpose, like "not found") alert the admins. */
const watchErrors = t.middleware(async ({ path, next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR") {
    await alertServerError(path).catch((error) => console.error("[alerts] failed", error));
  }
  return result;
});

export const publicQuery = t.procedure.use(watchErrors);

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(...roles: Role[]) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || !roles.includes(ctx.user.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = publicQuery.use(requireAuth);
/** Customers: book, follow and approve their own requests. */
export const customerQuery = authedQuery.use(requireRole("customer"));
/** Technicians: work the jobs assigned to them. */
export const technicianQuery = authedQuery.use(requireRole("technician"));
/**
 * Staff sessions (specialists and admins) see every customer's details and the applicants'
 * documents, so they must start with a password (an emailed code or Google isn't enough)
 * and pass two-step login (a code from an authenticator app). Returns why not, or null.
 */
export function staffSessionProblem(ctx: Pick<TrpcContext, "signInMethods" | "assuranceLevel">) {
  if (!ctx.signInMethods?.includes("password")) return STAFF_PASSWORD_REQUIRED;
  if (ctx.assuranceLevel !== "aal2") return STAFF_TWO_STEP_REQUIRED;
  return null;
}

/**
 * Staff endpoints: the right role, then a password sign-in with two-step login. Refusals for a
 * missing role or password are recorded (Admin → Activity → Staff actions, and the logs).
 */
function requireStaff(...roles: Role[]) {
  return t.middleware(async ({ ctx, path, next }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.unauthenticated });
    if (!roles.includes(ctx.user.role)) {
      await auditStaffRefusal(ctx.user.id, "role", path);
      throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.insufficientRole });
    }
    const problem = staffSessionProblem(ctx);
    if (problem) {
      // Waiting for the two-step code is a normal step of every staff sign-in: not recorded.
      if (problem === STAFF_PASSWORD_REQUIRED) await auditStaffRefusal(ctx.user.id, "password", path);
      throw new TRPCError({ code: "FORBIDDEN", message: problem });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

/** Specialists: office staff running the dashboard. Admins can do all of it too. */
export const specialistQuery = authedQuery.use(requireStaff("specialist", "admin"));
/** Admins: the admin area (customers, team, activity, figures). */
export const adminQuery = authedQuery.use(requireStaff("admin"));
