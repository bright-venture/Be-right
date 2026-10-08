import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceIcon } from "@/components/ServiceIcon";
import { DocumentUpload } from "@/components/DocumentUpload";
import { AgreeCheckbox } from "@/components/AgreeCheckbox";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { CATEGORY_MAP, SERVICES_IN_ORDER, type LocalText } from "@contracts/services";
import { isValidPhone } from "@contracts/phone";
import { DOCUMENT_FIELD, requiredDocuments, type ApplicationDocument } from "@contracts/applications";
import { isRateLimited } from "@/lib/errors";
import {
  AVAILABILITY,
  AVAILABILITY_LABELS,
  WORK_MODES,
  WORK_MODE_LABELS,
  type WorkMode,
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  TRANSPORT,
  TRANSPORT_LABELS,
  type Availability,
  type ExperienceLevel,
  type Transport,
} from "@contracts/applications";

const INPUT =
  "mt-2 min-h-12 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none";
const LABEL = "font-display text-base font-extrabold text-navy";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Every field of the application is required (website and app): each label carries this mark. */
function Req() {
  return (
    <span aria-hidden className="text-flame-ink">
      {"\u00a0*"}
    </span>
  );
}

/**
 * Pill buttons for picking one option, laid out as an even grid (`columns`): equal widths,
 * equal heights, and an odd last button spans the whole row instead of leaving a gap.
 */
function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
  columns,
}: {
  options: readonly { value: T; label: ReactNode }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  columns: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`mt-3 grid auto-rows-fr gap-2 ${columns}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 whitespace-nowrap rounded-full border-2 px-2 py-2 text-center text-[13px] font-bold leading-tight transition-colors ${
            value === o.value
              ? "border-navy bg-navy text-paper"
              : "border-navy/30 bg-white text-navy hover:border-navy"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Join() {
  const { t, p } = useI18n();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [trade, setTrade] = useState("");
  const [area, setArea] = useState("");
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [hasTools, setHasTools] = useState<"yes" | "no" | null>(null);
  const [workMode, setWorkMode] = useState<WorkMode | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [transport, setTransport] = useState<Transport | null>(null);
  const [notes, setNotes] = useState("");
  /** Storage key of each uploaded document (missing until uploaded). */
  const [documents, setDocuments] = useState<Partial<Record<ApplicationDocument, string>>>({});
  const setDocument = (kind: ApplicationDocument) => (key: string | null) =>
    setDocuments((d) => ({ ...d, [kind]: key ?? undefined }));
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submitMutation = trpc.join.submit.useMutation();
  const yesNo = [
    { value: "yes" as const, label: p(t.join.yes) },
    { value: "no" as const, label: p(t.join.no) },
  ];
  const labelled = <T extends string>(values: readonly T[], labels: Record<T, LocalText>) =>
    values.map((v) => ({ value: v, label: p(labels[v]) }));

  // The vehicle's papers show from the start (so nobody misses them) and only go away when
  // the applicant answers "No transport".
  const required = requiredDocuments(transport ?? "car");
  const valid =
    name.trim().length >= 2 &&
    isValidPhone(phone) &&
    EMAIL_PATTERN.test(email.trim()) &&
    trade !== "" &&
    area.trim().length >= 2 &&
    experience !== null &&
    availability !== null &&
    hasTools !== null &&
    workMode !== null &&
    (workMode !== "company" || companyName.trim().length >= 2) &&
    transport !== null &&
    notes.trim().length >= 3 &&
    required.every((kind) => !!documents[kind]) &&
    consent;

  async function submit() {
    if (!valid) return;
    setError("");
    try {
      await submitMutation.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        trade,
        area: area.trim(),
        experience: experience!,
        availability: availability!,
        hasTools: hasTools === "yes",
        workMode: workMode!,
        companyName: workMode === "company" ? companyName.trim() : undefined,
        transport: transport!,
        notes: notes.trim(),
        // `valid` above requires every document
        ...(Object.fromEntries(required.map((kind) => [DOCUMENT_FIELD[kind], documents[kind]!])) as Record<
          (typeof DOCUMENT_FIELD)[ApplicationDocument],
          string
        >),
        consent: true,
      });
      setDone(true);
    } catch (err) {
      setError(p(isRateLimited(err) ? t.misc.tooMany : t.misc.error));
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="flex-1 pt-16">
        <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          {done ? (
            <div className="card-br p-8 text-center sm:p-12">
              <CheckCircle2 className="mx-auto h-14 w-14 text-flame" />
              <h1 className="mt-6 font-display text-3xl font-black tracking-tight text-navy sm:text-4xl">
                {p(t.join.successTitle)}
              </h1>
              <p className="mx-auto mt-4 max-w-md leading-relaxed text-navy/70">
                {p(t.join.successBody)}
              </p>
              <Link to="/" className="btn-pill-primary mt-8">
                {p(t.join.backHome)}
                <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
              </Link>
            </div>
          ) : (
            <>
              <span className="tech-label text-flame-ink">{p(t.join.kicker)}</span>
              <h1 className="mt-4 font-display text-4xl font-black tracking-tight text-navy sm:text-5xl">
                {p(t.join.title)}
              </h1>
              <p className="mt-4 max-w-lg leading-relaxed text-navy/70">{p(t.join.sub)}</p>
              <p className="mt-2 text-sm font-semibold text-navy/70">
                <span className="text-flame-ink">*</span> {p(t.join.allRequired)}
              </p>

              <div className="card-br mt-8 flex flex-col gap-6 p-5 sm:p-8">
                <div>
                  <label htmlFor="join-name" className={LABEL}>
                    {p(t.join.name)}
                    <Req />
                  </label>
                  <input
                    id="join-name"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={p(t.join.namePh)}
                    className={INPUT}
                  />
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label htmlFor="join-phone" className={LABEL}>
                      {p(t.join.phone)}
                      <Req />
                    </label>
                    <input
                      id="join-phone"
                      required
                      type="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+961 70 000 000"
                      dir="ltr"
                      aria-invalid={phone.trim() !== "" && !isValidPhone(phone) ? true : undefined}
                      className={INPUT}
                    />
                    {phone.trim() !== "" && !isValidPhone(phone) && (
                      <p className="mt-1 text-sm font-semibold text-destructive">{p(t.misc.phoneInvalid)}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="join-email" className={LABEL}>
                      {p(t.join.email)}
                      <Req />
                    </label>
                    <input
                      id="join-email"
                      required
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      dir="ltr"
                      className={INPUT}
                    />
                  </div>
                </div>

                <div>
                  <p className={LABEL}>
                    {p(t.join.trade)}
                    <Req />
                  </p>
                  {/* Every trade as an equal tile, icon above its name, in a fixed grid: 2 per row on
                      phones, 4 from tablets up. Sixteen trades make full rows either way, and a long name
                      can never widen its tile and push the others out of line. */}
                  <div className="mt-3 grid auto-rows-fr grid-cols-2 gap-2 md:grid-cols-4">
                    {SERVICES_IN_ORDER.map((id) => CATEGORY_MAP[id])
                      .filter(Boolean)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={trade === c.id}
                          onClick={() => setTrade(c.id)}
                          // The tile is the size the name is measured against (below).
                          style={{ containerType: "inline-size" }}
                          className={`flex min-h-[84px] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-1.5 py-3 text-center transition-colors ${
                            trade === c.id
                              ? "border-navy bg-navy text-paper"
                              : "border-navy/20 bg-white text-navy hover:border-navy"
                          }`}
                        >
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                              trade === c.id ? "bg-white/15 text-flame-light" : "bg-bird/10 text-bird"
                            }`}
                          >
                            <ServiceIcon id={c.id} className="h-5 w-5" />
                          </span>
                          {/* One line, always: every name gets the same size, small enough for the longest one
                              ("Installation & assembly", about 12 times its font size) to fit its tile. */}
                          <span className="whitespace-nowrap font-bold leading-tight" style={{ fontSize: "min(13px, 100cqi / 12)" }}>
                            {p(c.name)}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="join-area" className={LABEL}>
                    {p(t.join.area)}
                    <Req />
                  </label>
                  <input
                    id="join-area"
                    required
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder={p(t.join.areaPh)}
                    className={INPUT}
                  />
                </div>

                <div>
                  <p className={LABEL}>
                    {p(t.join.experience)}
                    <Req />
                  </p>
                  <Choice
                    label={p(t.join.experience)}
                    options={labelled(EXPERIENCE_LEVELS, EXPERIENCE_LABELS)}
                    columns="grid-cols-2 sm:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1"
                    value={experience}
                    onChange={setExperience}
                  />
                </div>

                <div>
                  <p className={LABEL}>
                    {p(t.join.availability)}
                    <Req />
                  </p>
                  <Choice
                    label={p(t.join.availability)}
                    options={labelled(AVAILABILITY, AVAILABILITY_LABELS)}
                    columns="grid-cols-1 sm:grid-cols-3"
                    value={availability}
                    onChange={setAvailability}
                  />
                </div>

                <div>
                  <div>
                    <p className={LABEL}>
                      {p(t.join.hasTools)}
                      <Req />
                    </p>
                    <Choice
                      label={p(t.join.hasTools)}
                      options={yesNo}
                      value={hasTools}
                      onChange={setHasTools}
                      columns="grid-cols-2"
                    />
                  </div>
                </div>

                <div>
                  <p className={LABEL}>
                    {p(t.join.workMode)}
                    <Req />
                  </p>
                  <Choice
                    label={p(t.join.workMode)}
                    options={labelled(WORK_MODES, WORK_MODE_LABELS)}
                    value={workMode}
                    onChange={setWorkMode}
                    columns="grid-cols-2"
                  />
                  {workMode === "company" && (
                    <div className="mt-3">
                      <label htmlFor="join-company" className={LABEL}>
                        {p(t.join.companyName)}
                        <Req />
                      </label>
                      <input
                        id="join-company"
                        required
                        minLength={2}
                        maxLength={255}
                        autoComplete="organization"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder={p(t.join.companyNamePh)}
                        className={INPUT}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <p className={LABEL}>
                    {p(t.join.transport)}
                    <Req />
                  </p>
                  <Choice
                    label={p(t.join.transport)}
                    options={labelled(TRANSPORT, TRANSPORT_LABELS)}
                    columns="grid-cols-2 sm:grid-cols-5 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2"
                    value={transport}
                    onChange={setTransport}
                  />
                </div>

                <div>
                  <p className={LABEL}>
                    {p(t.docs.title)}
                    <Req />
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-navy/70">{p(t.docs.privacy)}</p>
                  <div className="mt-3 flex flex-col gap-3">
                    {required.map((kind) => (
                      <DocumentUpload
                        key={kind}
                        kind={kind}
                        label={p(t.docs[kind])}
                        hint={p(t.docs[`${kind}Hint`])}
                        onUploaded={setDocument(kind)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="join-notes" className={LABEL}>
                    {p(t.join.notes)}
                    <Req />
                  </label>
                  <textarea
                    id="join-notes"
                    required
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={p(t.join.notesPh)}
                    rows={3}
                    className="mt-2 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 py-3 font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none"
                  />
                </div>

                <AgreeCheckbox id="join-consent" text={t.legal.agreeApplication} checked={consent} onChange={setConsent} />

                {error && (
                  <p className="rounded-xl border-2 border-flame bg-flame/10 px-4 py-2 text-sm font-semibold text-flame-dark">
                    {error}
                  </p>
                )}

                <button
                  onClick={submit}
                  disabled={!valid || submitMutation.isPending}
                  className="btn-pill-primary w-full justify-center text-base disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitMutation.isPending ? p(t.join.sending) : p(t.join.submit)}
                  <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
                </button>
              </div>
            </>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
