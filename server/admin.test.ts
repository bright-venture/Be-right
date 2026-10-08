// The admin area: owners become admins, admins see everything and run the team;
// nobody else gets in.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { rateLimits, type User } from "@db/schema";
import { STAFF_PASSWORD_REQUIRED, STAFF_TWO_STEP_REQUIRED } from "@contracts/roles";
import {
  BEIRUT_PIN,
  callerFor,
  documentKeys,
  futureDate,
  makeSpecialist,
  makeTechnician,
  makeUser,
  meetingSlot,
  type TestDb,
} from "./test/harness";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  invites: [] as string[],
  /** Login ids handed out by invitations, and the ones withdrawn again. */
  invitedIds: [] as string[],
  deletedAuthUsers: [] as string[],
  deletedFactors: [] as { id: string; userId: string }[],
  emails: [] as { to: string[]; subject: string; text: string }[],
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
vi.mock("./lib/email", () => ({
  sendEmail: async (email: { to: string[]; subject: string; text: string }) => {
    state.emails.push(email);
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
          const id = crypto.randomUUID();
          state.invitedIds.push(id);
          return { data: { user: { id } }, error: null };
        },
        deleteUser: async (id: string) => {
          state.deletedAuthUsers.push(id);
          return { data: { user: null }, error: null };
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
    await expect((await callerFor()).admin.customers({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("needs a password sign-in: an emailed code or Google isn't enough", async () => {
    for (const methods of [["otp"], ["oauth"], ["recovery"], []]) {
      await expect(
        (await callerFor(owner, { signInMethods: methods })).admin.overview(),
      ).rejects.toMatchObject({ code: "FORBIDDEN", message: STAFF_PASSWORD_REQUIRED });
    }
    await expect((await callerFor(owner, { signInMethods: ["password", "totp"] })).admin.overview()).resolves.toBeDefined();
  });

  it("needs two-step login on top of the password", async () => {
    await expect(
      (await callerFor(owner, { signInMethods: ["password"], assuranceLevel: "aal1" })).admin.overview(),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: STAFF_TWO_STEP_REQUIRED });
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

  it("protects every staff endpoint the same way, for specialists and admins", async () => {
    const weak = [
      { signInMethods: ["otp"], assuranceLevel: "aal1" }, // emailed code
      { signInMethods: ["oauth"], assuranceLevel: "aal1" }, // Google
      { signInMethods: ["password"], assuranceLevel: "aal1" }, // no two-step yet
    ];
    for (const user of [desk, owner]) {
      for (const session of weak) {
        const c = await callerFor(user, session);
        await expect(c.specialist.queue()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(c.specialist.access()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(c.join.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(c.join.documents({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(c.tech.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      // Password plus two-step: allowed.
      await expect((await callerFor(user)).specialist.access()).resolves.toEqual({ ok: true });
    }
  });

  it("keeps a hired technician's application hired", async () => {
    const o = await callerFor(owner);
    const { id } = await (await callerFor()).join.submit({
      name: "Rawad",
      phone: "+961 70 999 000",
      email: "rawad@example.com",
      trade: "plumbing",
      area: "Zahle",
      experience: "3-5",
      availability: "full_time",
      hasTools: true,
      transport: "car",
      notes: "Ten years with residential plumbing",
      ...documentKeys(),
      consent: true,
    });
    await makeUser("rawad@example.com", "Rawad");
    await o.join.bookMeeting({ id, ...meetingSlot() });
    await o.join.hire({ id });
    for (const status of ["rejected", "contacted", "new"] as const) {
      await expect(o.join.setStatus({ id, status })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect((await o.join.list()).find((a) => a.id === id)).toMatchObject({ status: "hired", rejectedAt: null });
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

    const customers = (await o.admin.customers({})).items;
    expect(customers.find((c) => c.id === customer.id)).toMatchObject({ requests: 1 });
    expect(await o.admin.customerRequests({ id: customer.id })).toHaveLength(1);

    const activity = (await o.admin.activity({})).items;
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

describe("audit trail", () => {
  it("records staff changes, hires, removals and document views, for admins to read", async () => {
    const o = await callerFor(owner);
    // Staff: added by invitation, made admin, then taken off the team.
    await o.admin.addStaff({ email: "nour.desk@example.com", role: "specialist" });
    const nour = (await o.admin.team()).find((m) => m.email === "nour.desk@example.com")!;
    await o.admin.setStaffRole({ userId: nour.id, role: "admin" });
    await o.admin.setStaffRole({ userId: nour.id, role: "customer" });

    // An application: documents opened twice in one visit, a meeting, approved, then removed.
    const { id } = await (await callerFor()).join.submit({
      name: "Hadi",
      phone: "+961 71 222 333",
      email: "hadi@example.com",
      trade: "locksmith",
      area: "Jounieh",
      experience: "3-5",
      availability: "full_time",
      hasTools: true,
      transport: "motorcycle",
      notes: "Locks and car keys for eight years",
      ...documentKeys(),
      consent: true,
    });
    await o.join.documents({ id });
    await o.join.documents({ id });
    await o.join.bookMeeting({ id, ...meetingSlot() });
    await o.join.hire({ id });
    const hadi = (await o.tech.list()).find((x) => x.email === "hadi@example.com")!;
    await o.tech.remove({ technicianId: hadi.id });

    const log = (await o.admin.auditLog({})).items;
    const mine = log.filter((e) => e.applicationId === id || e.targetEmail === "nour.desk@example.com");
    // Newest first.
    expect(mine.map((e) => e.action)).toEqual([
      "technician_removed",
      "technician_hired",
      "meeting_booked",
      "documents_viewed", // once, not once per reload
      "staff_role_changed",
      "staff_role_changed",
      "staff_added",
    ]);
    expect(mine[0]).toMatchObject({ actorEmail: "owner@example.com", targetEmail: "hadi@example.com", applicantName: "Hadi" });
    expect(mine[2]).toMatchObject({ actorEmail: "owner@example.com", details: { place: "Be Right office, Hamra", rescheduled: false } });
    expect(mine[3]).toMatchObject({ actorEmail: "owner@example.com", applicantName: "Hadi" });
    expect(mine[4].details).toEqual({ from: "admin", to: "customer" });
    expect(mine[6]).toMatchObject({ actorEmail: "owner@example.com", details: { email: "nour.desk@example.com", role: "specialist", invited: true } });
    // The two-step reset earlier in this file is there too.
    expect(log.some((e) => e.action === "two_step_reset" && e.targetEmail === "desk@example.com")).toBe(true);
  });

  it("is for admins only", async () => {
    for (const user of [desk, customer, tech]) {
      await expect((await callerFor(user)).admin.auditLog({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("keeps applications and removing technicians for admins; specialists see technicians", async () => {
    const { id } = await (await callerFor()).join.submit({
      name: "Wael",
      phone: "+961 70 321 654",
      email: "wael@example.com",
      trade: "cameras",
      area: "Byblos",
      experience: "5-10",
      availability: "full_time",
      hasTools: true,
      transport: "van",
      notes: "Security cameras and alarms",
      ...documentKeys(),
      consent: true,
    });
    const d = await callerFor(desk);
    for (const call of [
      () => d.join.list(),
      () => d.join.documents({ id }),
      () => d.join.bookMeeting({ id, ...meetingSlot() }),
      () => d.join.setStatus({ id, status: "rejected" }),
      () => d.join.hire({ id }),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }

    const o = await callerFor(owner);
    await o.join.bookMeeting({ id, ...meetingSlot() });
    await o.join.hire({ id });
    const wael = (await d.tech.list()).find((x) => x.email === "wael@example.com")!;
    expect(wael).toMatchObject({ trade: "cameras", area: "Byblos" });
    await expect(d.tech.remove({ technicianId: wael.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(o.tech.remove({ technicianId: wael.id })).resolves.toMatchObject({ ok: true });
    // A closed application can't get a meeting.
    await o.join.setStatus({ id, status: "rejected" });
    await expect(o.join.bookMeeting({ id, ...meetingSlot() })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns real dates for a customer's last request (Safari can't read Postgres' text dates)", async () => {
    const maya = (await (await callerFor(owner)).admin.customers({})).items.find((c) => c.email === "maya@example.com")!;
    expect(maya.lastRequestAt).toBeInstanceOf(Date);
  });
});

/** Makes the next database calls of one kind fail, as if the database went down. */
async function withDatabaseDown(method: "select" | "transaction", run: () => Promise<void>) {
  const db = state.db as Record<string, unknown>;
  const real = db[method];
  db[method] = () => {
    throw new Error("database is down");
  };
  try {
    await run();
  } finally {
    db[method] = real;
  }
}

describe("safety nets", () => {
  it("withdraws a staff invitation when the account can't be saved", async () => {
    const o = await callerFor(owner);
    await withDatabaseDown("transaction", async () => {
      await expect(o.admin.addStaff({ email: "lina.desk@example.com", role: "specialist" })).rejects.toBeDefined();
    });
    // The invitation's login was deleted, so its link no longer works; nobody was added.
    expect(state.deletedAuthUsers).toEqual([state.invitedIds.at(-1)]);
    expect((await o.admin.team()).some((m) => m.email === "lina.desk@example.com")).toBe(false);
    // Once it works again, the invitation simply goes out again.
    await expect(o.admin.addStaff({ email: "lina.desk@example.com", role: "specialist" })).resolves.toMatchObject({
      invited: true,
    });
  });

  it("withdraws a technician's invitation when hiring can't be saved, and the application stays open", async () => {
    const o = await callerFor(owner);
    const { id } = await (await callerFor()).join.submit({
      name: "Sami",
      phone: "+961 76 444 555",
      email: "sami@example.com",
      trade: "pest",
      area: "Tyre",
      experience: "1-3",
      availability: "part_time",
      hasTools: true,
      transport: "car",
      notes: "Pest control for restaurants",
      ...documentKeys(),
      consent: true,
    });
    await o.join.bookMeeting({ id, ...meetingSlot() });
    const withdrawnBefore = state.deletedAuthUsers.length;
    await withDatabaseDown("transaction", async () => {
      await expect(o.join.hire({ id })).rejects.toBeDefined();
    });
    expect(state.deletedAuthUsers.slice(withdrawnBefore)).toEqual([state.invitedIds.at(-1)]);
    expect((await o.join.list()).find((a) => a.id === id)).toMatchObject({ status: "contacted", hiredUserId: null });
  });

  it("records staff areas refused for a missing role or password, once per visit", async () => {
    const o = await callerFor(owner);
    const c = await callerFor(customer);
    await expect(c.specialist.queue()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.join.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    // An admin session that didn't start with a password.
    await expect((await callerFor(owner, { signInMethods: ["otp"], assuranceLevel: "aal1" })).admin.team()).rejects
      .toMatchObject({ code: "FORBIDDEN" });
    // Waiting for the two-step code is a normal step, not recorded.
    const deskRefusals = async () =>
      ((await o.admin.auditLog({})).items).filter((e) => e.action === "staff_access_refused" && e.actorEmail === "desk@example.com").length;
    const deskBefore = await deskRefusals();
    await expect(
      (await callerFor(desk, { signInMethods: ["password"], assuranceLevel: "aal1" })).specialist.queue(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const refused = ((await o.admin.auditLog({})).items).filter((e) => e.action === "staff_access_refused");
    const byCustomer = refused.filter((e) => e.actorEmail === "maya@example.com");
    expect(byCustomer).toHaveLength(1);
    expect(byCustomer[0].details).toMatchObject({ reason: "role" }); // one line per visit, however many tries
    expect(refused.filter((e) => e.actorEmail === "owner@example.com")[0].details).toMatchObject({ reason: "password" });
    expect(await deskRefusals()).toBe(deskBefore);
  });

  it("emails the admins about server errors, at most once an hour", async () => {
    const o = await callerFor(owner);
    // The outages simulated above already sent this hour's alert: start a new hour.
    await (state.db as TestDb).delete(rateLimits);
    const before = state.emails.length;
    await withDatabaseDown("select", async () => {
      await expect(o.admin.customers({})).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
      await expect(o.admin.customers({})).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });
    const alerts = state.emails.slice(before).filter((e) => e.subject.startsWith("Server errors"));
    expect(alerts).toHaveLength(1);
    // Sent to the ADMIN_EMAILS setting even though the database (and its admin list) was down.
    expect(alerts[0].to).toEqual(["owner@example.com"]);
    expect(alerts[0].text).toContain("admin.customers");
  });

  it("keeps errors thrown on purpose (not found, refused) out of the alerts", async () => {
    const before = state.emails.length;
    await expect((await callerFor(owner)).admin.setStaffRole({ userId: 999_999, role: "admin" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(state.emails.slice(before).some((e) => e.subject.startsWith("Server errors"))).toBe(false);
  });
});
