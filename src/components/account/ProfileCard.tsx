import { BadgeCheck, CalendarDays, Star } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { ServiceIcon } from "@/components/ServiceIcon";
import { CATEGORY_MAP } from "@contracts/services";
import type { Role } from "@contracts/roles";

type Me = { name: string | null; email: string | null; phone: string | null; role: Role };

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = name?.trim() || email || "BR";
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** The profile photo (a technician's), or the initials in a circle. */
export function ProfileAvatar({ me, photoUrl, size = "h-24 w-24 text-2xl" }: { me: Me; photoUrl?: string | null; size?: string }) {
  return photoUrl ? (
    <img src={photoUrl} alt="" className={`${size} shrink-0 rounded-full object-cover ring-4 ring-white shadow-[0_6px_18px_rgb(12_43_92/0.18)]`} />
  ) : (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-flame font-display font-black text-white ring-4 ring-white shadow-[0_6px_18px_rgb(12_43_92/0.18)]`}
    >
      {initials(me.name, me.email)}
    </span>
  );
}

/** "4.8 ★ · 23 ratings", or "No ratings yet". */
export function RatingLine({ rating, className = "" }: { rating: { average: number | null; count: number }; className?: string }) {
  const { t, p, lang } = useI18n();
  if (rating.average === null) return <p className={`text-sm text-navy/60 ${className}`}>{p(t.account.noRatings)}</p>;
  return (
    <p className={`inline-flex items-center gap-1.5 text-sm ${className}`}>
      <Star className="h-4 w-4 text-flame" fill="currentColor" aria-hidden />
      <span className="font-display text-base font-black">{rating.average.toLocaleString(lang === "ar" ? "ar" : "en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}</span>
      <span className="opacity-70">· {p(t.account.ratingCount).replace("{n}", String(rating.count))}</span>
    </p>
  );
}

/**
 * The top of My account on the website, like a ride app's profile: who you are, your role
 * and, for a technician, the rating customers gave them and their jobs; for a customer, their
 * requests. Everything comes from `auth.profile`.
 */
export function ProfileCard({ me }: { me: Me }) {
  const { t, p, lang } = useI18n();
  const profile = trpc.auth.profile.useQuery(undefined, { staleTime: 60_000 });
  const data = profile.data;
  const role = { customer: t.app.roleCustomer, technician: t.app.roleTechnician, specialist: t.app.roleSpecialist, admin: t.app.roleAdmin }[me.role];
  const since = data
    ? new Date(data.memberSince).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", { month: "long", year: "numeric" })
    : null;
  const trade = data?.technician?.trade ? CATEGORY_MAP[data.technician.trade] : null;
  const stats: [string, string][] = data?.technician
    ? [
        [p(t.account.statDone), String(data.technician.completedJobs)],
        [p(t.account.statActive), String(data.technician.activeJobs)],
      ]
    : data?.customer
      ? [
          [p(t.account.statRequests), String(data.customer.requests)],
          [p(t.account.statCompleted), String(data.customer.completed)],
        ]
      : [];

  return (
    <section className="overflow-hidden rounded-3xl border border-navy/10 bg-white shadow-[0_1px_2px_rgb(12_43_92/0.06)]">
      {/* a coloured band behind the photo */}
      <div className="h-20 bg-navy" />
      <div className="-mt-12 flex flex-col items-center px-6 pb-6 text-center">
        <ProfileAvatar me={me} photoUrl={data?.photoUrl} />
        <h2 className="mt-3 font-display text-xl font-black text-navy">{me.name || me.email}</h2>
        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-navy/[0.06] px-2.5 py-0.5 text-xs font-bold text-navy">
          <BadgeCheck className="h-3.5 w-3.5 text-bird" />
          {p(role)}
        </span>
        {trade && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-bird">
            <ServiceIcon id={data!.technician!.trade!} className="h-4 w-4" /> {p(trade.name)}
          </p>
        )}
        {data?.technician && <RatingLine rating={data.technician.rating} className="mt-2 text-navy" />}

        {stats.length > 0 && (
          <dl className="mt-5 grid w-full grid-cols-2 divide-x divide-navy/10 rounded-2xl border border-navy/10 rtl:divide-x-reverse">
            {stats.map(([label, value]) => (
              <div key={label} className="px-3 py-3">
                <dd className="font-display text-xl font-black text-navy">{value}</dd>
                <dt className="text-xs font-medium text-navy/60">{label}</dt>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-5 w-full space-y-1 border-t border-navy/10 pt-4 text-sm text-navy/70">
          {me.email && (
            <p className="truncate" dir="ltr">
              {me.email}
            </p>
          )}
          {me.phone && <p dir="ltr">{me.phone}</p>}
          {since && (
            <p className="inline-flex items-center gap-1.5 text-xs text-navy/55">
              <CalendarDays className="h-3.5 w-3.5" /> {p(t.account.memberSince).replace("{date}", since)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
