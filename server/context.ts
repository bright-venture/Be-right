import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateSession } from "./lib/auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  /** How this session was started ("password", "otp", "oauth"...): the admin area needs a password. */
  signInMethods?: string[];
  /** A valid sign-in whose account couldn't be loaded (e.g. database error). */
  accountLoadFailed?: boolean;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    const session = await authenticateSession(opts.req.headers);
    ctx.user = session?.user;
    ctx.signInMethods = session?.signInMethods;
  } catch (error) {
    // Authentication is optional here; protected procedures reject missing users.
    // Invalid tokens resolve to undefined, so reaching here means a real failure.
    console.warn("[auth] Failed to authenticate request", error);
    ctx.accountLoadFailed = true;
  }
  return ctx;
}
