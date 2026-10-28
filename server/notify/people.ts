// Who hears about what (a service's specialists, the admins), and the job details messages use.

import { eq } from "drizzle-orm";
import { serviceRequests, users } from "@db/schema";
import { CATEGORY_MAP, workerOf } from "@contracts/services";
import { visitTime } from "@contracts/visitTime";
import { getDb } from "../queries/connection";
import { specialistsOf } from "../lib/serviceSpecialists";
import { sendPush } from "../lib/push";
import { afterResponse } from "../lib/afterResponse";
import { type Lang, type Message, both, local, send } from "./email";
import { log } from "../lib/log";

/** Runs a notification without ever failing or slowing the caller (a failure is logged). */
export async function safely(name: string, fn: () => Promise<unknown>): Promise<void> {
  // Sent once the answer is on its way (lib/afterResponse.ts): saving never waits for Resend or Firebase.
  await afterResponse(async () => {
    try {
      await fn();
    } catch (error) {
      log.error(`[notify] ${name} failed`, error);
    }
  });
}

/* ---------- data ---------- */

/** Everyone with one role (admins, or specialists only). */
export async function emailsOf(role: "admin" | "specialist") {
  const rows = await getDb().select({ email: users.email }).from(users).where(eq(users.role, role));
  return rows.map((r) => r.email);
}

/** Who hears about a service's requests: all its specialists, or the admins when it has none (and for Other). */
export async function staffFor(category: string | null): Promise<Person[]> {
  const owners = await specialistsOf(category);
  if (owners.length) return owners;
  return getDb().select({ id: users.id, email: users.email }).from(users).where(eq(users.role, "admin"));
}

export const specialistEmails = async (category: string | null) => (await staffFor(category)).map((p) => p?.email);

type Person = { id: number; email: string | null } | null | undefined;

/**
 * The email, and a push to their phones with the same title and first line: a tap opens
 * `path` in the app. Emergencies are `urgent` (a louder channel). Neither stops the other.
 */
export async function tell(people: Person[], message: Message, push: { path: string; urgent?: boolean }) {
  const [mail, phone] = await Promise.allSettled([
    send(
      people.map((p) => p?.email),
      message,
    ),
    sendPush(
      people.map((p) => p?.id),
      { title: message.title, body: message.lines[0] ?? message.title, ...push },
    ),
  ]);
  if (phone.status === "rejected") log.error("[notify] push failed", phone.reason);
  if (mail.status === "rejected") throw mail.reason;
  return mail.value;
}

export async function loadJob(id: number) {
  const db = getDb();
  const request = await db.query.serviceRequests.findFirst({ where: eq(serviceRequests.id, id) });
  if (!request) throw new Error(`Request ${id} not found`);
  const [customer, technician] = await Promise.all([
    request.userId ? db.query.users.findFirst({ where: eq(users.id, request.userId) }) : undefined,
    request.technicianId ? db.query.users.findFirst({ where: eq(users.id, request.technicianId) }) : undefined,
  ]);
  return { request, customer, technician };
}

type Job = Awaited<ReturnType<typeof loadJob>>;

export function describe(job: Job) {
  const r = job.request;
  const day = (lang: Lang) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${r.preferredDate}T00:00:00Z`));
  const slot = visitTime(r);
  return {
    id: r.id,
    category: local(CATEGORY_MAP[r.category]?.name, r.category),
    /** Who does it: "plumber", "cleaner"... ("professional" when the service isn't known). */
    worker: workerOf(r.category),
    area: r.area,
    when: both(`${day("en")}, ${slot.en}`, `${day("ar")}، ${slot.ar}`),
  };
}
