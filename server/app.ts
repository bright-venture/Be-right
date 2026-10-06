import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { TRPCError } from "@trpc/server";
import { clientIp, LIMITS, rateLimit } from "./lib/rateLimit";
import { appRouter } from "./router";
import { createContext } from "./context";

// The HTTP API, shared by every entry point: the Vite dev server, the standalone
// Node server (boot.ts) and the Vercel function (vercel.ts).
const app = new Hono();

// Media goes straight to Supabase Storage, so API bodies stay small.
app.use(bodyLimit({ maxSize: 1024 * 1024 }));
app.use(
  secureHeaders({
    contentSecurityPolicy: undefined,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);
// The phone app (Capacitor) runs the site from the phone and calls this API from these
// origins. Sign-in travels as a Bearer token, never a cookie, so no credentials are shared.
const APP_ORIGINS = ["https://localhost", "capacitor://localhost"];
app.use(
  "/api/*",
  cors({
    origin: (origin) => (APP_ORIGINS.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["authorization", "content-type"],
    maxAge: 86400,
  }),
);
app.get("/api/health", (c) => c.json({ ok: true }));

// Crash reports from browsers (src/lib/reportError.ts), so front-end errors land in the
// function logs next to server errors: Netlify → Logs → Functions → api, "[client-error]".
app.post("/api/client-error", bodyLimit({ maxSize: 8 * 1024 }), async (c) => {
  try {
    await rateLimit(`client-error:ip:${clientIp(c.req.raw)}`, LIMITS.clientErrorPerIp);
  } catch (error) {
    if (error instanceof TRPCError) return c.body(null, 429);
    // Counter unavailable (database down): still log, the body limit keeps it small.
  }
  const report = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  if (report && typeof report.message === "string") {
    console.error(
      "[client-error]",
      JSON.stringify({
        message: clip(report.message, 500),
        stack: clip(report.stack, 3000),
        page: clip(report.page, 200),
        release: clip(report.release, 40),
        browser: clip(c.req.header("user-agent"), 200),
      }),
    );
  }
  return c.body(null, 204);
});
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
    onError: ({ path, error }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        console.error(`[trpc] ${path ?? "<unknown>"}`, error);
      }
    },
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;
