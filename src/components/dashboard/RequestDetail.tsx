import { Loader2, Mail, MessageCircle, Phone } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { Stars } from "@/components/Stars";
import { MediaGrid } from "@/components/MediaGrid";
import { BeforeAfter } from "@/components/JobPhotos";
import { AnswerList } from "@/components/AnswerList";
import JobMap from "@/components/map/JobMap";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { telLink, whatsappLink } from "@/lib/contact";
import { CATEGORY_MAP, forWorker, type RequestStatus } from "@contracts/services";
import { visitTime } from "@contracts/visitTime";
import { DISTRICT_INFO } from "@contracts/districts";
import { LABEL, SMALL_BTN, type Technician } from "./requestDetailParts";
import { NextStep } from "./NextStep";
import { Preparation } from "./Preparation";

export function RequestDetail({
  id,
  technicians,
  onGoToApplications,
}: {
  id: number;
  technicians: Technician[];
  onGoToApplications?: () => void;
}) {
  const { t, p, lang } = useI18n();
  const utils = trpc.useUtils();
  const detail = trpc.specialist.detail.useQuery({ id });
  const invalidate = () => {
    void utils.specialist.queue.invalidate();
    void utils.specialist.detail.invalidate({ id });
    void utils.tech.list.invalidate();
  };

  const d = detail.data;
  if (!d) {
    return (
      <div className="card-br flex min-h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-navy" />
      </div>
    );
  }

  const r = d.request;
  const status = r.status as RequestStatus;
  const cat = CATEGORY_MAP[r.category];
  const tech = d.technician;
  const dateTime = (v: Date | string) =>
    new Date(v).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    // key on the request: switching requests resets every form below
    <div key={r.id} className="card-br p-5 sm:p-6 animate-rise-in">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-navy/15 bg-paper text-bird">
          <ServiceIcon id={r.category} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-black text-navy">
            #{r.id} · {cat ? p(cat.name) : r.category}
          </h2>
          <p className="text-xs text-navy/70">
            {p(t.dash4.created)} {dateTime(r.createdAt)}
          </p>
          {d.guarantee && (
            <p className="mt-1 text-xs font-bold text-bird">
              {p(t.requests.guaranteeFor).replace("{id}", String(d.guarantee.originalId))}
              {d.guarantee.technicianName &&
                ` · ${p(t.dash4.originalTech).replace("{name}", d.guarantee.technicianName)}`}
            </p>
          )}
        </div>
        {r.emergency && (
          <span className="rounded-full bg-flame px-3 py-1 text-xs font-bold text-white">{p(t.emergency.badge)}</span>
        )}
        <span className="rounded-full border-2 border-navy/25 px-3 py-1 text-xs font-bold text-navy">
          {p(t.status[status])}
        </span>
      </div>

      <NextStep
        // a new status or cancellation request resets the forms
        key={`${r.id}-${status}-${r.cancelRequestedAt ?? ""}`}
        request={r}
        technicians={technicians}
        onDone={invalidate}
        onGoToApplications={onGoToApplications}
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {/* left: customer, place, problem */}
        <div className="flex flex-col gap-5">
          <section className="rounded-2xl border-2 border-navy/15 bg-paper p-4 text-sm">
            <p className={LABEL}>{p(t.dash.customer)}</p>
            <p className="mt-2 font-bold text-navy">{d.customer?.name ?? r.contactName ?? "-"}</p>
            {d.customer?.email && <p className="text-navy/70">{d.customer.email}</p>}
            {/* An emergency job's phone can arrive after the technician was sent. */}
            <p className="mt-1 text-navy/70" dir="ltr">
              {r.phone || "-"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.phone && (
                <>
                  <a href={telLink(r.phone)} className={SMALL_BTN}>
                    <Phone className="h-4 w-4" /> {p(t.dash3.call)}
                  </a>
                  <a href={whatsappLink(r.phone)} target="_blank" rel="noreferrer" className={SMALL_BTN}>
                    <MessageCircle className="h-4 w-4" /> {p(t.dash3.whatsapp)}
                  </a>
                </>
              )}
              {d.customer?.email && (
                <a href={`mailto:${d.customer.email}`} className={SMALL_BTN}>
                  <Mail className="h-4 w-4" /> {p(t.dash3.emailAction)}
                </a>
              )}
            </div>
            <p className={`${LABEL} mt-4`}>{p(t.dash4.visit)}</p>
            <p className="mt-1 text-navy/80">
              {[r.district && p(DISTRICT_INFO[r.district].name), r.area, r.address].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-navy/80">
              {r.preferredDate} ·{" "}
              {p(visitTime(r))}
            </p>
          </section>

          {r.lat != null && r.lng != null ? (
            <JobMap
              key={r.id}
              home={{ lat: r.lat, lng: r.lng }}
              technician={d.location ? { lat: Number(d.location.lat), lng: Number(d.location.lng) } : null}
              technicianLabel="T"
            />
          ) : (
            <p className="text-xs text-navy/70">{p(t.map.noPin)}</p>
          )}

          <section className="text-sm">
            <p className={LABEL}>{p(t.dash.answers)}</p>
            <AnswerList category={r.category} answersJson={r.answers} className="mt-2 flex flex-col gap-1.5" />
            {r.notes && <p className="mt-3 rounded-xl bg-navy/5 p-3 text-navy/80">{r.notes}</p>}
          </section>

          {d.media.some((m) => m.kind === "customer") && (
            <section>
              <p className={LABEL}>{p(t.dash.media)}</p>
              <MediaGrid items={d.media.filter((m) => m.kind === "customer")} className="mt-2 grid grid-cols-3 gap-2" />
            </section>
          )}
          <section className="empty:hidden">
            <BeforeAfter media={d.media} />
          </section>
        </div>

        {/* right: technician, preparation, timeline */}
        <div className="flex flex-col gap-5">
          <section className="rounded-2xl border-2 border-navy/15 bg-paper p-4">
            <p className={LABEL}>{p(t.dash2.currentTech)}</p>
            {tech ? (
              <div className="mt-2 flex items-center gap-3">
                <Avatar name={tech.name} photoUrl={tech.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-navy">{tech.name ?? tech.email}</p>
                  {!tech.stillTechnician && <p className="text-xs text-navy/70">{p(t.dash4.formerTechnician)}</p>}
                  {tech.phone && (
                    <p className="text-xs text-navy/70" dir="ltr">
                      {tech.phone}
                    </p>
                  )}
                </div>
                {tech.phone && (
                  <a href={whatsappLink(tech.phone)} target="_blank" rel="noreferrer" className={SMALL_BTN}>
                    <MessageCircle className="h-4 w-4" /> {p(t.dash3.whatsapp)}
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm font-bold text-navy">{p(t.dash2.none)}</p>
            )}
            {r.quoteAmount && (
              <p className="mt-3 text-xs text-navy/70">
                {p(t.dash4.quote)}:{" "}
                <span className="font-bold text-navy">
                  {r.guaranteeFor && r.quoteAmount === "0" ? p(t.requests.free) : `$${r.quoteAmount}`}
                </span>
                {r.quoteNote ? ` · ${r.quoteNote}` : ""}
              </p>
            )}
          </section>

          {d.review && (
            <section className="rounded-2xl border-2 border-flame/40 bg-flame/5 p-4">
              <p className={LABEL}>{p(t.dash4.customerRating)}</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-bold text-navy">
                <Stars value={d.review.rating} size={16} />
                {d.review.rating}/5
              </p>
              {d.review.comment && <p className="mt-2 text-sm text-navy/80">“{d.review.comment}”</p>}
            </section>
          )}

          <Preparation key={r.id} request={r} onSaved={invalidate} />

          <section>
            <p className={LABEL}>{p(t.dash4.timeline)}</p>
            <ol className="mt-3 border-s-2 border-navy/15 ps-4">
              {d.events.map((e) => (
                <li key={e.id} className="relative pb-3">
                  <span className="absolute -start-[23px] top-1 h-3 w-3 rounded-full border-2 border-paper bg-navy" />
                  <p className="text-sm font-bold text-navy">
                    {p(
                      forWorker(
                        (t.events as Record<string, { en: string; ar: string }>)[e.status] ??
                          t.status[e.status as RequestStatus] ?? { en: e.status, ar: e.status },
                        d.request.category,
                      ),
                    )}
                  </p>
                  {e.note && <p className="text-xs text-navy/80">{e.note}</p>}
                  <p className="text-xs text-navy/60" dir="ltr">
                    {dateTime(e.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

export function Avatar({ name, photoUrl, size = "h-10 w-10" }: { name: string | null; photoUrl: string | null; size?: string }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return photoUrl ? (
    <img src={photoUrl} alt="" className={`${size} shrink-0 rounded-full border-2 border-bird object-cover`} />
  ) : (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full border-2 border-bird bg-bird/10 text-xs font-black text-bird`}>
      {initials}
    </span>
  );
}
