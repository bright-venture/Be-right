import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { Role } from "@contracts/roles";

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
export const publicQuery = t.procedure;

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

export const authedQuery = t.procedure.use(requireAuth);
/** Customers: book, follow and approve their own requests. */
export const customerQuery = authedQuery.use(requireRole("customer"));
/** Technicians: work the jobs assigned to them. */
export const technicianQuery = authedQuery.use(requireRole("technician"));
/** Specialists: office staff running the dashboard. Admins can do all of it too. */
export const specialistQuery = authedQuery.use(requireRole("specialist", "admin"));
/** Admins: the admin area (customers, team, activity, figures). */
export const adminQuery = authedQuery.use(requireRole("admin"));
