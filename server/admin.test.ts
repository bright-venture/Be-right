// The admin area: owners become admins, admins see everything and run the team;
// nobody else gets in.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@db/schema";
import { BEIRUT_PIN, callerFor, futureDate, makeTechnician, makeUser } from "./test/harness";

const state = vi.hoisted(() => ({ db: undefined as unknown, invites: [] as string[] }));

vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
vi.mock("./lib/env", () => ({
  env: {
    isProduction: false,
    databaseUrl: "",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
    storageBucket: "test",
    siteUrl: "https://be-rightbright.com",
    ownerEmails: ["owner@example.com"],
    specialistEmails: ["desk@example.com"],
  },
}));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);
vi.mock("./lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        inviteUserByEmail: async (email: string) => {
          state.invites.push(email);
          return { data: { user: { id: crypto.randomUUID() } }, error: null };
        },
      },
    },
  }),
}));

let owner: User;
let desk: User; // specialist from the settings
let customer: User;
let tech: User;

beforeAll(async () => {
  state.db = await import("./test/harness").then((h) => h.createTestDb());
  owner = await makeUser("owner@example.com", "Owner");
  desk = await makeUser("desk@example.com", "Desk");
  customer = await makeUser("maya@example.com", "Maya");
  tech = await makeTechnician("fadi.tech@example.com", "Fadi");
  // One booking, so the figures and the customer list have something to show.
  await (await callerFor(customer)).requests.create({
    category: "plumbing",
    answers: { problem: "leak", location: "bathroom", flow: "large", canStop: "no", sourceVisible: "yes" },
    preferredDate: futureDate(),
    timeSlot: "morning",
    area: "Hamra",
    address: "Building 1",
    phone: "+961 70 000 000",
    media: [],
    ...BEIRUT_PIN,
  });
}, 60_000);


describe("admin area", () => {
  it("makes owners admins on sign-in", () => {
    expect(owner.role).toBe("admin");
    expect(desk.role).toBe("specialist");
  });

  it("is open to admins only", async () => {
    for (const user of [desk, customer, tech]) {
      await expect((await callerFor(user)).admin.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect((await callerFor()).admin.customers()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lets admins do everything specialists do", async () => {
    const o = await callerFor(owner);
    expect((await o.specialist.queue()).length).toBe(1);
    await expect(o.join.list()).resolves.toBeDefined();
    await expect(o.tech.list()).resolves.toBeDefined();
  });

  it("shows the figures, every customer and the activity", async () => {
    const o = await callerFor(owner);
    const overview = await o.admin.overview();
    expect(overview.requests.total).toBe(1);
    expect(overview.requests.byStatus.submitted).toBe(1);
    expect(overview.people.admin).toBe(1);
    expect(overview.topServices[0]).toMatchObject({ category: "plumbing", n: 1 });

    const customers = await o.admin.customers();
    expect(customers.find((c) => c.id === customer.id)).toMatchObject({ requests: 1 });
    expect(await o.admin.customerRequests({ id: customer.id })).toHaveLength(1);

    const activity = await o.admin.activity();
    expect(activity[0]).toMatchObject({ status: "submitted", actorName: "Maya" });
  });

  it("adds people to the team, by account or by invitation", async () => {
    const o = await callerFor(owner);
    await o.admin.addStaff({ email: "maya@example.com", role: "specialist" });
    expect((await o.admin.team()).find((m) => m.id === customer.id)).toMatchObject({ role: "specialist" });

    const { invited } = await o.admin.addStaff({ email: "new.desk@example.com", role: "specialist" });
    expect(invited).toBe(true);
    expect(state.invites).toContain("new.desk@example.com");

    // Technicians come from hiring, not from here.
    await expect(o.admin.addStaff({ email: "fadi.tech@example.com", role: "specialist" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("changes team roles safely", async () => {
    const o = await callerFor(owner);
    // Not your own role, and not roles that come from the settings.
    await expect(o.admin.setStaffRole({ userId: owner.id, role: "specialist" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(o.admin.setStaffRole({ userId: desk.id, role: "customer" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Promote, then take off the team.
    await o.admin.setStaffRole({ userId: customer.id, role: "admin" });
    expect((await o.admin.team()).find((m) => m.id === customer.id)?.role).toBe("admin");
    await o.admin.setStaffRole({ userId: customer.id, role: "customer" });
    expect((await o.admin.team()).some((m) => m.id === customer.id)).toBe(false);
  });
});
