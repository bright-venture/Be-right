// Every API request gets an id: sent back as X-Request-Id, and on each log line it writes, so
// one request can be found in the logs. The admins' server-error email names it.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Email } from "./lib/email";
import { log, requestId, withRequestId } from "./lib/log";
import { createTestDb, makeAdmin } from "./test/harness";

const state = vi.hoisted(() => ({ db: undefined as unknown, sent: [] as Email[] }));
vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
vi.mock("./lib/env", async () => ({ env: (await import("./test/env")).testEnv() }));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);
vi.mock("./lib/email", () => ({
  sendEmail: async (email: Email) => {
    state.sent.push(email);
    return true;
  },
}));

describe("request ids", () => {
  beforeAll(async () => {
    state.db = await createTestDb();
    await makeAdmin("owner@example.com");
  }, 60_000);
  afterEach(() => vi.restoreAllMocks());

  it("come back with every answer, a new one each time", async () => {
    const { default: app } = await import("./app");
    const [a, b] = await Promise.all([app.fetch(new Request("http://x/api/health")), app.fetch(new Request("http://x/api/health"))]);
    expect(a.headers.get("x-request-id")).toMatch(/^[0-9a-f]{8}$/);
    expect(b.headers.get("x-request-id")).toMatch(/^[0-9a-f]{8}$/);
    expect(a.headers.get("x-request-id")).not.toBe(b.headers.get("x-request-id"));
  });

  it("start each log line a request writes; lines outside a request stay as they were", async () => {
    const { default: app } = await import("./app");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await app.fetch(
      new Request("http://x/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "boom", page: "/book" }),
      }),
    );
    const id = res.headers.get("x-request-id");
    expect(spy).toHaveBeenCalledWith(`[${id}]`, "[client-error]", expect.stringContaining("boom"));

    spy.mockClear();
    log.error("[cleanup]", "done");
    expect(spy).toHaveBeenCalledWith("[cleanup]", "done");
    expect(requestId()).toBeUndefined();
  });

  it("are named in the admins' server-error email", async () => {
    const { notify } = await import("./notify");
    const id = await withRequestId(async (id) => {
      await notify.serverError("requests.create");
      return id;
    });
    const email = state.sent.find((m) => m.subject.includes("Server errors"));
    expect(email?.text).toContain(`[${id}]`);
  });
});
