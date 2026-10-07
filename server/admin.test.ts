// The admin area: owners become admins, admins see everything and run the team;
// nobody else gets in.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@db/schema";
import { ADMIN_PASSWORD_REQUIRED, ADMIN_TWO_STEP_REQUIRED } from "@contracts/roles";
import { BEIRUT_PIN, callerFor, futureDate, makeSpecialist, makeTechnician, makeUser } from "./test/harness";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  invites: [] as string[],
  deletedFactors: [] as { id: string; userId: string }[],
}));

vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
vi.mock("./lib/env", () => ({
  env: {
    isProduction: false,
    databaseUrl: "",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
    storageBucket: "test",
    siteUrl: "https://be-rightbright.com",
    adminEmails: ["owner@example.com"],
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
        // Every staff account has one verified authenticator app.
        mfa: {
          listFactors: async () => ({ data: { factors: [{ id: "factor-1", status: "verified" }] }, error: null }),
          deleteFactor: async (params: { id: string; userId: string }) => {
            state.deletedFactors.push(params);
            return { data: { id: params.id }, error: null };
          },
        },
      },
    },
  }),
}));

let owner: User;
let desk: User; // a specialist
let customer: User;
let tech: User;

beforeAll(async () => {
  state.db = await import("./test/harness").then((h) => h.createTestDb());
  owner = await makeUser("owner@example.com", "Owner");
  desk = await makeSpecialist("desk@example.com", "Desk");
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
  it("makes ADMIN_EMAILS admins on sign-in, and nobody else", async () => {
    expect(owner.role).toBe("admin");
    expect(desk.role).toBe("specialist");
    expect((await makeUser("someone@example.com")).role).toBe("customer");
  });

  it("is open to admins only", async () => {
    for (const user of [desk, customer, tech]) {
      await expect((await callerFor(user)).admin.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect((await callerFor()).admin.customers()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("needs a password sign-in: an emailed code or Google isn't enough", async () => {
    for (const methods of [["otp"], ["oauth"], ["recovery"], []]) {
      await expect(
        (await callerFor(owner, { signInMethods: methods })).admin.overview(),
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: ADMIN_PASSWORD_REQUIRED });
    }
    await expect((await callerFor(owner, { signInMethods: ["password", "totp"] })).admin.overview()).resolves.toBeDefined();
  });

  it("needs two-step login on top of the password", async () => {
    await expect(
      (await callerFor(owner, { signInMethods: ["password"], assuranceLevel: "aal1" })).admin.overview(),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: ADMIN_TWO_STEP_REQUIRED });
    await expect(
      (await callerFor(owner, { signInMethods: ["password", "totp"], assuranceLevel: "aal2" })).admin.overview(),
    ).resolves.toBeDefined();
  });

  it("resets someone else's two-step login, never your own", async () => {
    const o = await callerFor(owner);
    await expect(o.admin.resetTwoStep({ userId: owner.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await o.admin.resetTwoStep({ userId: desk.id })).toMatchObject({ ok: true, removed: 1 });
    expect(state.deletedFactors).toEqual([{ id: "factor-1", userId: desk.authId }]);
    // Shown in the team list.
    expect((await o.admin.team()).find((m) => m.id === desk.id)).toHaveProperty("twoStep", true);
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
    // Not your own role, and not an admin listed in ADMIN_EMAILS (another admin can't demote them).
    await expect(o.admin.setStaffRole({ userId: owner.id, role: "specialist" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await o.admin.setStaffRole({ userId: desk.id, role: "admin" });
    const d = await callerFor({ ...desk, role: "admin" });
    await expect(d.admin.setStaffRole({ userId: owner.id, role: "customer" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await o.admin.setStaffRole({ userId: desk.id, role: "specialist" });

    // Promote, then take off the team.
    await o.admin.setStaffRole({ userId: customer.id, role: "admin" });
    expect((await o.admin.team()).find((m) => m.id === customer.id)?.role).toBe("admin");
    await o.admin.setStaffRole({ userId: customer.id, role: "customer" });
    expect((await o.admin.team()).some((m) => m.id === customer.id)).toBe(false);
  });
});
