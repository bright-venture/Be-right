// Each service has one specialist, who alone handles its requests and emergencies; one person
// can have several services. Admins see everything, and handle services nobody has (and Other).
import { and, eq, inArray, isNull } from "drizzle-orm";
import { serviceSpecialists, users } from "../../db/schema";
import { getDb } from "../queries/connection";
import type { RequestScope } from "./workflow";

type Staff = { id: number; role: string };

/** The services a specialist has (only while they are still an active specialist). */
export async function servicesOf(userId: number): Promise<string[]> {
  const rows = await getDb()
    .select({ service: serviceSpecialists.service })
    .from(serviceSpecialists)
    .innerJoin(users, eq(users.id, serviceSpecialists.specialistId))
    .where(and(eq(serviceSpecialists.specialistId, userId), eq(users.role, "specialist"), isNull(users.deletedAt)));
  return rows.map((r) => r.service);
}

/** Which requests this staff member may see and act on: admins all, specialists their services. */
export async function staffScope(user: Staff): Promise<RequestScope> {
  return user.role === "admin" ? "any" : { categories: await servicesOf(user.id) };
}

/** Does this staff member handle this service? (null: Other, or an emergency without a service.) */
export async function handles(user: Staff, category: string | null): Promise<boolean> {
  if (user.role === "admin") return true;
  return category !== null && (await servicesOf(user.id)).includes(category);
}

/** The specialist in charge of a service, if it has one who is still on the team. */
export async function specialistOf(category: string | null) {
  if (!category) return null;
  const [row] = await getDb()
    .select({ id: users.id, email: users.email })
    .from(serviceSpecialists)
    .innerJoin(users, eq(users.id, serviceSpecialists.specialistId))
    .where(and(eq(serviceSpecialists.service, category), eq(users.role, "specialist"), isNull(users.deletedAt)));
  return row ?? null;
}

/** Every service and its specialist (services without one aren't listed: admins handle them). */
export async function allServiceSpecialists() {
  return getDb()
    .select({ service: serviceSpecialists.service, specialistId: serviceSpecialists.specialistId })
    .from(serviceSpecialists)
    .innerJoin(users, eq(users.id, serviceSpecialists.specialistId))
    .where(and(eq(users.role, "specialist"), isNull(users.deletedAt)));
}

/** Someone left the specialist role (now admin, customer, or deleted): their services go back to admins. */
export async function releaseServices(db: Pick<ReturnType<typeof getDb>, "delete">, userIds: number[]) {
  if (userIds.length) await db.delete(serviceSpecialists).where(inArray(serviceSpecialists.specialistId, userIds));
}
