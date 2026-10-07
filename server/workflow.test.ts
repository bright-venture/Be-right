import { beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@db/schema";
import {
  ADMIN_EMAIL,
  BEIRUT_PIN,
  callerFor,
  addJobPhoto,
  createTestDb,
  deletedMedia,
  documentKeys,
  futureDate,
  makeTechnician,
  makeUser,
  type TestDb,
} from "./test/harness";

const state = vi.hoisted(() => ({ db: undefined as unknown, invites: [] as string[] }));

vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
vi.mock("./lib/env", () => ({
  env: {
    isProduction: false,
    databaseUrl: "",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
    storageBucket: "test",
    specialistEmails: ["specialist@example.com"],
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

const application = {
  name: "Hassan Khalil",
  phone: "+961 71 111 111",
  email: "hassan@example.com",
  trade: "electrical",
  area: "Beirut",
  experience: "5-10" as const,
  availability: "full_time" as const,
  hasTools: true,
  transport: "car" as const,
  notes: "Licensed electrician, 8 years with residential buildings",
  ...documentKeys(),
  consent: true as const,
};

const leak = {
  problem: "leak",
  location: "bathroom",
  flow: "large",
  canStop: "no",
  sourceVisible: "yes",
};

function booking(overrides: Record<string, unknown> = {}) {
  return {
    category: "plumbing",
    answers: leak,
    preferredDate: futureDate(),
    timeSlot: "morning" as const,
    area: "Achrafieh",
    address: "Building 3, floor 2",
    phone: "+961 70 000 000",
    media: [],
    ...BEIRUT_PIN,
    ...overrides,
  };
}

let db: TestDb;
let admin: User;
let alice: User; // customer
let bob: User; // another customer
let tina: User; // technician

beforeAll(async () => {
  db = await createTestDb();
  state.db = db;
  admin = await makeUser(ADMIN_EMAIL, "Specialist");
  alice = await makeUser("alice@example.com", "Alice");
  bob = await makeUser("bob@example.com", "Bob");
  tina = await makeUser("tina@example.com", "Tina");
}, 60_000);

describe("accounts", () => {
  it("gives the specialist role only to SPECIALIST_EMAILS", () => {
    expect(admin.role).toBe("specialist");
    expect(alice.role).toBe("customer");
  });

  it("returns the same user on repeat sign-in", async () => {
    const { findOrCreateUser } = await import("./queries/users");
    const again = await findOrCreateUser({ authId: alice.authId, email: alice.email, name: null });
    expect(again?.id).toBe(alice.id);
  });

  it("keeps the phone given at sign-up, without overwriting a saved one", async () => {
    const { findOrCreateUser } = await import("./queries/users");
    const authId = crypto.randomUUID();
    const created = await findOrCreateUser({ authId, email: "dana@example.com", name: "Dana", phone: "+961 3 123 456" });
    expect(created?.phone).toBe("+961 3 123 456");
    const again = await findOrCreateUser({ authId, email: "dana@example.com", name: "Dana", phone: "+961 70 999 999" });
    expect(again?.phone).toBe("+961 3 123 456");
  });

  it("auth.me is null for visitors", async () => {
    expect(await (await callerFor()).auth.me()).toBeNull();
  });
});

describe("technician applications (public)", () => {
  it("lets visitors apply and only specialists review", async () => {
    const { id } = await (await callerFor()).join.submit(application);
    await expect((await callerFor(alice)).join.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const list = await (await callerFor(admin)).join.list();
    expect(list.map((a) => a.id)).toContain(id);
    // The transport type is kept, and "has transport" follows from it.
    expect(list.find((a) => a.id === id)).toMatchObject({ transport: "car", hasTransport: true });
    await (await callerFor(admin)).join.setStatus({ id, status: "contacted" });
    expect((await (await callerFor(admin)).join.list()).find((a) => a.id === id)?.status).toBe(
      "contacted",
    );
  });

  it("rejects unknown trades and missing answers", async () => {
    await expect(
      (await callerFor()).join.submit({ ...application, trade: "hacking" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Every field is required, what they tell us about their work included.
    await expect(
      (await callerFor()).join.submit({ ...application, notes: "  " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Transport: one of the listed types, never left out.
    await expect(
      (await callerFor()).join.submit({ ...application, transport: "bicycle" as never }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const withoutTransport: Partial<typeof application> = { ...application };
    delete withoutTransport.transport;
    await expect(
      (await callerFor()).join.submit(withoutTransport as typeof application),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("terms and consent", () => {
  it("records the terms version accepted at sign-up", () => {
    expect(alice.termsVersion).toBe("test-version");
    expect(alice.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it("asks older accounts to accept before booking, then lets them book", async () => {
    const legacy = await makeUser("legacy@example.com", "Legacy", { acceptedTerms: false });
    const c = await callerFor(legacy);
    await expect(c.requests.create(booking())).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { version } = await c.auth.acceptTerms();
    const accepted = await callerFor({ ...legacy, termsAcceptedAt: new Date(), termsVersion: version });
    await expect(accepted.requests.create(booking())).resolves.toMatchObject({ id: expect.any(Number) });
  });

  it("requires applicants to consent", async () => {
    await expect(
      (await callerFor()).join.submit({ ...application, consent: false as unknown as true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { id } = await (await callerFor()).join.submit({ ...application, email: "consent@example.com" });
    const row = (await (await callerFor(admin)).join.list()).find((a) => a.id === id);
    expect(row?.consentAt).toBeInstanceOf(Date);
  });
});

describe("technician documents", () => {
  it("requires the ID and photo, uploaded, with the right kind", async () => {
    const c = await callerFor();
    const docs = documentKeys();
    await expect(c.join.submit({ ...application, ...docs, photoKey: docs.idDocumentKey })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      c.join.submit({ ...application, ...docs, idDocumentKey: docs.idDocumentKey.replace("file", "missing") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(c.join.submit({ ...application, ...docs, idDocumentKey: "requests/x/idDocument-a.jpg" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("checks document type and size before handing out an upload link", async () => {
    const c = await callerFor();
    await expect(
      c.storage.createDocumentUpload({ kind: "photo", fileName: "me.pdf", size: 1000, contentType: "application/pdf" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      c.storage.createDocumentUpload({ kind: "idDocument", fileName: "id.pdf", size: 50 * 1024 * 1024, contentType: "application/pdf" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const ok = await c.storage.createDocumentUpload({ kind: "idDocument", fileName: "id.pdf", size: 1000, contentType: "application/pdf" });
    expect(ok.key).toMatch(/^applications\/.+\/idDocument-id\.pdf$/);
  });

  it("lets only specialists open an applicant's documents", async () => {
    const { id } = await (await callerFor()).join.submit({ ...application, email: "docs@example.com" });
    await expect((await callerFor(alice)).join.documents({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const docs = await (await callerFor(admin)).join.documents({ id });
    expect(docs.idDocument?.url).toContain("idDocument");
    expect(docs.photo?.url).toContain("photo");
  });

  it("refuses to hire an application without documents", async () => {
    const { technicianApplications } = await import("@db/schema");
    const [old] = await db
      .insert(technicianApplications)
      .values({ name: "No Docs", phone: "+961 1 111 111", trade: "plumbing", area: "Jbeil", email: "nodocs@example.com" })
      .returning({ id: technicianApplications.id });
    await expect((await callerFor(admin)).join.hire({ id: old.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("hiring technicians from applications", () => {
  it("invites a new applicant and creates their technician account right away", async () => {
    const { id } = await (await callerFor()).join.submit({ ...application, email: "New.Tech@Example.com" });
    const s = await callerFor(admin);
    const res = await s.join.hire({ id });
    expect(res).toMatchObject({ invited: true, email: "new.tech@example.com" });
    expect(state.invites).toContain("new.tech@example.com");
    const techs = await s.tech.list();
    expect(techs.map((x) => x.email)).toContain("new.tech@example.com");
    const app = (await s.join.list()).find((a) => a.id === id);
    expect(app?.status).toBe("hired");
    expect(app?.hiredUserId).toBeTruthy();
  });

  it("promotes an applicant who already has an account, without inviting", async () => {
    const existing = await makeUser("already@example.com", "Already");
    const { id } = await (await callerFor()).join.submit({ ...application, email: "already@example.com" });
    const before = state.invites.length;
    const res = await (await callerFor(admin)).join.hire({ id });
    expect(res.invited).toBe(false);
    expect(state.invites.length).toBe(before);
    expect((await (await callerFor(admin)).tech.list()).map((x) => x.id)).toContain(existing.id);
  });

  it("refuses to hire a specialist's email or an application without email", async () => {
    const s = await callerFor(admin);
    const { id } = await (await callerFor()).join.submit({ ...application, email: ADMIN_EMAIL });
    await expect(s.join.hire({ id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Older applications had no email: the specialist supplies one when hiring.
    const { technicianApplications } = await import("@db/schema");
    const [old] = await db
      .insert(technicianApplications)
      .values({ name: "Old Applicant", phone: "+961 1 000 000", trade: "plumbing", area: "Saida", ...documentKeys() })
      .returning({ id: technicianApplications.id });
    await expect(s.join.hire({ id: old.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const res = await s.join.hire({ id: old.id, email: "old.applicant@example.com" });
    expect(res.invited).toBe(true);
  });

  it("warns before hiring onto an existing account, and removal reopens the application", async () => {
    const s = await callerFor(admin);
    const customer = await makeUser("david@example.com", "David");
    await (await callerFor(customer)).requests.create(booking());
    expect(await s.join.hireCheck({ email: "nobody-yet@example.com" })).toEqual({ existing: null });
    expect(await s.join.hireCheck({ email: "david@example.com" })).toEqual({
      existing: { name: "David", role: "customer", bookings: 1 },
    });

    const { id } = await (await callerFor()).join.submit({ ...application, email: "david@example.com" });
    await s.join.hire({ id });
    await s.tech.remove({ technicianId: customer.id });
    const reopened = (await s.join.list()).find((a) => a.id === id);
    expect(reopened).toMatchObject({ status: "contacted", hiredUserId: null });
    expect((await s.tech.list()).map((x) => x.id)).not.toContain(customer.id);
  });

  it("only specialists can hire", async () => {
    const { id } = await (await callerFor()).join.submit({ ...application, email: "x@example.com" });
    await expect((await callerFor(alice)).join.hire({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("full repair workflow", () => {
  let requestId: number;
  const aliceKey = () => `requests/${alice.authId}/photo.jpg`;

  it("requires sign-in to book", async () => {
    await expect((await callerFor()).requests.create(booking())).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("requires the map pin to be in Lebanon", async () => {
    await expect(
      (await callerFor(alice)).requests.create(booking({ lat: 48.85, lng: 2.35 })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unknown categories and other users' uploads", async () => {
    const c = await callerFor(alice);
    await expect(c.requests.create(booking({ category: "nope" }))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      c.requests.create(
        booking({ media: [{ key: `requests/${bob.authId}/x.jpg`, fileName: "x.jpg", size: 1 }] }),
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("customer books; urgency is computed on the server", async () => {
    const res = await (await callerFor(alice)).requests.create(
      booking({ media: [{ key: aliceKey(), fileName: "photo.jpg", size: 1234, contentType: "image/jpeg" }] }),
    );
    requestId = res.id;
    expect(res.urgency).toBe("urgent");
    const mine = await (await callerFor(alice)).requests.mine();
    expect(mine.map((r) => r.id)).toContain(requestId);
  });

  it("flags burning smell as critical", async () => {
    const res = await (await callerFor(bob)).requests.create(
      booking({ category: "electrical", answers: { problem: "burning", scope: "single", exposed: "no" } }),
    );
    expect(res.urgency).toBe("critical");
  });

  it("keeps customers out of each other's requests", async () => {
    const b = await callerFor(bob);
    await expect(b.requests.get({ id: requestId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(b.requests.cancel({ id: requestId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.requests.approveQuote({ id: requestId, amount: "45" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await b.storage.urls({ keys: [aliceKey()] })).urls).toEqual({});
  });

  it("keeps non-admins out of the specialist dashboard", async () => {
    const a = await callerFor(alice);
    await expect(a.specialist.queue()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(a.specialist.startReview({ id: requestId, urgency: "normal" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(a.tech.myJobs()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("specialist reviews and quotes", async () => {
    const s = await callerFor(admin);
    expect((await s.specialist.queue()).map((r) => r.request.id)).toContain(requestId);
    await s.specialist.startReview({ id: requestId, urgency: "priority" });
    await expect(s.specialist.startReview({ id: requestId, urgency: "normal" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await s.specialist.sendQuote({ id: requestId, amount: "45", note: "Replace angle valve" });
    const d = await s.specialist.detail({ id: requestId });
    expect(d.request.status).toBe("quote_ready");
    expect(d.request.urgencyFinal).toBe("priority");
    expect(d.media).toHaveLength(1);
  });

  it("customer approves the quote once", async () => {
    const a = await callerFor(alice);
    await a.requests.approveQuote({ id: requestId, amount: "45" });
    await expect(a.requests.approveQuote({ id: requestId, amount: "45" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("specialist assigns a technician", async () => {
    const s = await callerFor(admin);
    tina = await makeTechnician("tina.tech@example.com", "Tina");
    expect((await s.tech.list()).map((x) => x.id)).toContain(tina.id);
    await expect(s.tech.assign({ requestId, technicianId: bob.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await s.tech.assign({ requestId, technicianId: tina.id });
  });

  it("enforces the status order", async () => {
    const s = await callerFor(admin);
    await expect(s.specialist.setStatus({ id: requestId, status: "completed" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await s.specialist.setStatus({ id: requestId, status: "scheduled" });
  });

  it("technician works the job and shares location", async () => {
    const t = await callerFor(tina);
    expect((await t.tech.myJobs()).map((r) => r.id)).toContain(requestId);
    const other = await callerFor({ ...bob, role: "technician" });
    await expect(
      other.tech.fieldEvent({ requestId, action: "arrived" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await t.tech.fieldEvent({ requestId, action: "arrived" });
    await t.tech.reportLocation({ requestId, lat: 33.8886, lng: 35.4955, accuracy: 12 });
    await t.tech.reportLocation({ requestId, lat: 33.889, lng: 35.496 });

    const seen = await (await callerFor(alice)).requests.get({ id: requestId });
    expect(seen.technician?.name).toBe("Tina");
    expect(seen.request.lat).toBeCloseTo(BEIRUT_PIN.lat);
    expect(Number(seen.location?.lat)).toBeCloseTo(33.889);

    expect((await t.storage.urls({ keys: [aliceKey()] })).urls[aliceKey()]).toBeTruthy();

    // Every job is documented: no start without a before photo, no finish without an after photo.
    await expect(t.tech.fieldEvent({ requestId, action: "start" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(addJobPhoto(t, requestId, "after")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(addJobPhoto(other, requestId, "before")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const photo = (key: string) => [{ key, fileName: "p.jpg", size: 1, contentType: "image/jpeg" }];
    // Only the technician's own, finished uploads.
    await expect(
      t.tech.addJobPhotos({ requestId, kind: "before", photos: photo(aliceKey()) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      t.tech.addJobPhotos({ requestId, kind: "before", photos: photo(`requests/${tina.authId}/missing.jpg`) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await addJobPhoto(t, requestId, "before");
    const wrong = await addJobPhoto(t, requestId, "before");
    await t.tech.removeJobPhoto({ requestId, key: wrong });
    expect(deletedMedia).toContain(wrong);
    // The customer's own photo can't be removed by the technician.
    await expect(t.tech.removeJobPhoto({ requestId, key: aliceKey() })).rejects.toMatchObject({ code: "NOT_FOUND" });

    await t.tech.fieldEvent({ requestId, action: "start" });
    await expect(t.tech.fieldEvent({ requestId, action: "complete" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await addJobPhoto(t, requestId, "after");
    await t.tech.fieldEvent({ requestId, action: "complete", note: "Valve replaced" });
    // Closed: no more photos.
    await expect(addJobPhoto(t, requestId, "after")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      t.tech.reportLocation({ requestId, lat: 1, lng: 1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("customer sees the finished job and can no longer cancel it", async () => {
    const a = await callerFor(alice);
    const done = await a.requests.get({ id: requestId });
    expect(done.request.status).toBe("completed");
    expect(done.location).toBeNull(); // live location hidden once the job is closed
    // The customer sees their own photo and the technician's before and after photos.
    const kinds = done.media.map((m) => m.kind);
    expect(kinds.filter((k) => k === "customer")).toHaveLength(1);
    expect(kinds.filter((k) => k === "before")).toHaveLength(1);
    expect(kinds.filter((k) => k === "after")).toHaveLength(1);
    const keys = done.media.map((m) => m.key);
    expect(Object.keys((await a.storage.urls({ keys })).urls).sort()).toEqual([...keys].sort());
    expect(done.events.map((e) => e.status)).toEqual(
      expect.arrayContaining(["submitted", "in_review", "quote_ready", "approved", "assigned", "scheduled", "arrived", "in_progress", "completed"]),
    );
    await expect(a.requests.cancel({ id: requestId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("customer can cancel an open request", async () => {
    const a = await callerFor(alice);
    const { id } = await a.requests.create(booking());
    await a.requests.cancel({ id });
    expect((await a.requests.get({ id })).request.status).toBe("cancelled");
  });
});
