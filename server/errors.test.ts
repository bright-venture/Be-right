// What visitors see when something fails on the live site: no stack traces, and no
// internal details from unexpected crashes. Runs the API like Netlify does (no NODE_ENV).
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./lib/env", () => ({
  env: {
    isProduction: true,
    databaseUrl: "",
    supabaseUrl: "", // makes signed-in requests fail to load the account
    supabaseServiceRoleKey: "",
    storageBucket: "test",
    docsBucket: "test-docs",
  },
}));
// Every database call crashes with a message that must never reach visitors.
vi.mock("./queries/connection", () => ({
  getDb: () => {
    throw new Error('relation "secret_table" does not exist');
  },
}));

let app: typeof import("./app").default;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "");
  vi.resetModules();
  app = (await import("./app")).default;
}, 60_000); // loads the whole API fresh

async function call(path: string, init?: { body?: unknown; token?: string }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.token) headers.authorization = `Bearer ${init.token}`;
  const res = await app.fetch(
    new Request(`http://test.local/api/trpc/${path}`, {
      method: init?.body ? "POST" : "GET",
      headers,
      body: init?.body ? JSON.stringify({ json: init.body }) : undefined,
    }),
  );
  const json = (await res.json()) as { error: { json: { message: string; data: Record<string, unknown> } } };
  return { status: res.status, message: json.error.json.message, data: json.error.json.data };
}

describe("API errors in production", () => {
  it("never includes a stack trace", async () => {
    const res = await call("specialist.queue");
    expect(res.status).toBe(401);
    expect(res.data).not.toHaveProperty("stack");
  });

  it("hides the details of unexpected crashes", async () => {
    const key = (kind: string) => `applications/${randomUUID()}/${kind}-file.jpg`;
    const res = await call("join.submit", {
      body: {
        name: "Test Applicant",
        phone: "+961 70 123 456",
        email: "applicant@example.com",
        trade: "plumbing",
        districts: ["beirut"],
        experience: "1-3",
        hasTools: true,
        workMode: "independent",
        transport: "car",
        photoKey: key("photo"),
        documents: { idDocument: true, criminalRecord: true, proofOfAddress: true, vehicleRegistration: true },
        consent: true,
      },
    });
    expect(res.status).toBe(500);
    expect(res.message).not.toContain("secret_table");
    expect(res.message).toMatch(/something went wrong/i);
    expect(res.data).not.toHaveProperty("stack");
  });

  it("keeps messages written for the user", async () => {
    const res = await call("auth.me", { token: "any-token" });
    expect(res.status).toBe(500);
    expect(res.message).toMatch(/couldn't be loaded/);
  });
});
