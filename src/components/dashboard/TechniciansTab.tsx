import { useState } from "react";
import { FileText, Loader2, Mail, MessageCircle, Phone, Star } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/router";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { telLink, whatsappLink } from "@/lib/contact";
import { CATEGORY_MAP } from "@contracts/services";
import { APPLICATION_DOCUMENTS, EXPERIENCE_LABELS, type ExperienceLevel } from "@contracts/applications";
import { Avatar } from "./RequestDetail";
import { useAuth } from "@/hooks/useAuth";

type Technician = inferRouterOutputs<AppRouter>["tech"]["list"][number];
const SMALL_BTN = "btn-pill-outline !min-h-9 !px-3 !py-1 text-xs";

/** `onGoToApplications`: only in the admin area (specialists don't handle applications). */
export function TechniciansTab({ onGoToApplications }: { onGoToApplications?: () => void }) {
  const { t, p } = useI18n();
  const list = trpc.tech.list.useQuery();
  const techs = list.data ?? [];

  if (list.isLoading) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-navy" />;
  if (techs.length === 0) {
    return (
      <div className="card-br mt-8 p-10 text-center">
        <p className="font-semibold text-navy/70">{p(t.dash4.noTechnicians)}</p>
        {onGoToApplications && (
          <button onClick={onGoToApplications} className="btn-pill-primary mt-5">
            {p(t.dash4.goToApplications)}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {techs.map((x) => (
        <TechnicianCard key={x.id} tech={x} />
      ))}
    </div>
  );
}

function TechnicianCard({ tech: x }: { tech: Technician }) {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const [showDocs, setShowDocs] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const remove = trpc.tech.remove.useMutation({
    onSuccess: () => {
      void utils.tech.list.invalidate();
      void utils.join.list.invalidate();
      void utils.specialist.queue.invalidate(); // released jobs need a technician again
    },
  });
  const docs = trpc.join.documents.useQuery({ id: x.applicationId ?? 0 }, { enabled: showDocs && !!x.applicationId });
  const trade = x.trade ? CATEGORY_MAP[x.trade] : null;

  return (
    <div className="card-br flex flex-col p-5">
      <div className="flex items-center gap-3">
        <Avatar name={x.name} photoUrl={x.photoUrl} size="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-extrabold text-navy">{x.name ?? "-"}</p>
          {trade && (
            <p className="flex items-center gap-1.5 text-xs font-bold text-bird">
              <ServiceIcon id={x.trade!} className="h-4 w-4" /> {p(trade.name)}
            </p>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-paper p-2">
          <dt className="text-[11px] font-bold text-navy/70">{p(t.dash4.activeJobs)}</dt>
          <dd className="font-display text-xl font-black text-navy">{x.activeJobs}</dd>
        </div>
        <div className="rounded-xl bg-paper p-2">
          <dt className="text-[11px] font-bold text-navy/70">{p(t.dash4.completedJobs)}</dt>
          <dd className="font-display text-xl font-black text-navy">{x.completedJobs}</dd>
        </div>
        <div className="rounded-xl bg-paper p-2">
          <dt className="text-[11px] font-bold text-navy/70">{p(t.dash4.rating)}</dt>
          <dd className="font-display text-xl font-black text-navy">
            {x.rating.average !== null ? (
              <span className="inline-flex items-center gap-1" title={`${x.rating.count}`}>
                {x.rating.average.toFixed(1)}
                <Star className="h-4 w-4 text-flame" fill="currentColor" aria-hidden />
              </span>
            ) : (
              "-"
            )}
          </dd>
        </div>
      </dl>

      <dl className="mt-3 flex flex-col gap-1 text-xs">
        {x.area && (
          <div className="flex justify-between gap-3">
            <dt className="text-navy/70">{p(t.dash4.techArea)}</dt>
            <dd className="text-end font-semibold text-navy">{x.area}</dd>
          </div>
        )}
        {x.experience && (
          <div className="flex justify-between gap-3">
            <dt className="text-navy/70">{p(t.dash4.techExperience)}</dt>
            <dd className="text-end font-semibold text-navy">{p(EXPERIENCE_LABELS[x.experience as ExperienceLevel])}</dd>
          </div>
        )}
        {x.email && <p className="truncate text-navy/70">{x.email}</p>}
        {x.phone && (
          <p className="text-navy/70" dir="ltr">
            {x.phone}
          </p>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {x.phone && (
          <>
            <a href={telLink(x.phone)} className={SMALL_BTN}>
              <Phone className="h-4 w-4" /> {p(t.dash3.call)}
            </a>
            <a href={whatsappLink(x.phone)} target="_blank" rel="noreferrer" className={SMALL_BTN}>
              <MessageCircle className="h-4 w-4" /> {p(t.dash3.whatsapp)}
            </a>
          </>
        )}
        {x.email && (
          <a href={`mailto:${x.email}`} className={SMALL_BTN}>
            <Mail className="h-4 w-4" /> {p(t.dash3.emailAction)}
          </a>
        )}
        {x.applicationId && isAdmin && (
          <button onClick={() => setShowDocs((v) => !v)} className={SMALL_BTN} aria-expanded={showDocs}>
            <FileText className="h-4 w-4" /> {showDocs ? p(t.dash4.hideDocuments) : p(t.dash4.documents)}
          </button>
        )}
      </div>

      {showDocs && (
        <ul className="mt-3 flex flex-col gap-1 rounded-xl bg-paper p-3 text-xs">
          {docs.isLoading && <Loader2 className="h-4 w-4 animate-spin text-navy" />}
          {/* only the documents this technician had to provide (the server lists those) */}
          {APPLICATION_DOCUMENTS.filter((kind) => !docs.data || kind in docs.data).map((kind) => {
            const doc = docs.data?.[kind];
            return (
              !docs.isLoading && (
                <li key={kind} className="flex justify-between gap-3">
                  <span className="text-navy/70">{p(t.docs[kind])}</span>
                  {doc ? (
                    <a href={doc.url} target="_blank" rel="noreferrer" className="font-bold text-navy underline underline-offset-4">
                      {p(t.docs.open)}
                    </a>
                  ) : (
                    <span className="font-bold text-destructive">{p(t.docs.missing)}</span>
                  )}
                </li>
              )
            );
          })}
        </ul>
      )}

      {isAdmin && (
      <div className="mt-auto pt-4">
        <button
          onClick={() => {
            if (window.confirm(p(t.dash4.removeConfirm).replace("{name}", x.name ?? x.email ?? ""))) {
              remove.mutate({ technicianId: x.id });
            }
          }}
          disabled={remove.isPending}
          className="text-xs font-bold text-navy/70 underline underline-offset-4 hover:text-destructive disabled:opacity-40"
        >
          {p(t.dash2.remove)}
        </button>
        {remove.error && <p className="mt-1 text-xs font-semibold text-destructive">{remove.error.message}</p>}
      </div>
      )}
    </div>
  );
}
