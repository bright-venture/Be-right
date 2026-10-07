// The phone app (Capacitor) calls the live API from its own origins; other websites can't.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./lib/env", () => ({
  env: {
    isProduction: true,
    databaseUrl: "",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
    storageBucket: "test",
    docsBucket: "test-docs",
  },
}));

let app: typeof import("./app").default;

beforeAll(async () => {
  app = (await import("./app")).default;
}, 60_000); // loads the whole API

async function preflight(origin: string) {
  const res = await app.fetch(
    new Request("http://test.local/api/trpc/auth.me", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    }),
  );
  return res.headers.get("access-control-allow-origin");
}

describe("API access from the phone app", () => {
  it("allows the Android and iOS app", async () => {
    expect(await preflight("https://localhost")).toBe("https://localhost");
    expect(await preflight("capacitor://localhost")).toBe("capacitor://localhost");
  });

  it("refuses other websites", async () => {
    expect(await preflight("https://evil.example")).toBeNull();
    expect(await preflight("http://localhost")).toBeNull();
  });

  it("answers normal requests from the app with the CORS header", async () => {
    const res = await app.fetch(new Request("http://test.local/api/health", { headers: { origin: "capacitor://localhost" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
  });
});
