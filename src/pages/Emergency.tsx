import { useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router";
import { AlertTriangle, MapPin, Phone, PhoneCall, Siren } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceIcon } from "@/components/ServiceIcon";
import LocationPicker, { type Pin } from "@/components/map/LocationPicker";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { telLink } from "@/lib/contact";
import { isNetworkError, isRateLimited } from "@/lib/errors";
import { EMERGENCIES, EMERGENCY_MAP, OTHER_EMERGENCY, emergencyLabel } from "@contracts/emergency";
import { COMPANY } from "@contracts/legal";
import { isValidPhone } from "@contracts/phone";
import { CATEGORY_MAP } from "@contracts/services";

const INPUT =
  "mt-2 min-h-12 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none";
const LABEL = "font-display text-sm font-extrabold text-navy";
const CHOICE =
  "flex min-h-16 items-center gap-3 rounded-[22px] border-[1.5px] border-navy/15 bg-white p-4 text-start font-display text-sm font-extrabold text-navy shadow-[0_3px_0_rgb(12_43_92/0.1)] transition-all hover:-translate-y-0.5 hover:border-navy hover:shadow-[0_5px_0_rgb(12_43_92/0.9)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame";

/**
 * The Emergency button: pick the service, then what's wrong, then share where you are, then
 * enter your name and number and call the emergency line (COMPANY.emergencyPhone). The
 * details are saved as the call starts, so the team sees who is calling, why and where.
 * Each step is in the address (?cat=…&problem=…&at=call), so the Back button goes back a step.
 */
export default function Emergency() {
  const { t, p } = useI18n();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const category = EMERGENCY_MAP[params.get("cat") ?? ""] ? params.get("cat")! : null;
  const entry = category ? EMERGENCY_MAP[category] : null;
  const asked = params.get("problem") ?? "";
  const problem =
    entry && (asked === OTHER_EMERGENCY || entry.problems.some((x) => x.id === asked)) ? asked : null;
  const step = !category ? 1 : !problem ? 2 : params.get("at") !== "call" ? 3 : 4;

  const go = (next: { cat?: string; problem?: string; call?: boolean }) => {
    const updated = new URLSearchParams();
    if (next.cat) updated.set("cat", next.cat);
    if (next.problem) updated.set("problem", next.problem);
    if (next.call) updated.set("at", "call");
    setParams(updated);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const line = COMPANY.emergencyPhone.trim();
  const danger = entry?.problems.find((x) => x.id === problem)?.danger ?? false;

  // Contact details: the account's until the customer types their own.
  const [nameInput, setName] = useState<string | null>(null);
  const [phoneInput, setPhone] = useState<string | null>(null);
  const name = nameInput ?? user?.name ?? "";
  const phone = phoneInput ?? user?.phone ?? "";

  // Where the customer is: the team sees it on the map and can send a technician at once.
  const [pin, setPin] = useState<Pin | null>(null);
  const [address, setAddress] = useState("");
  const where = { lat: pin?.lat, lng: pin?.lng, address: address.trim() || undefined };

  const report = trpc.emergency.report.useMutation();
  const [error, setError] = useState<string | null>(null);

  /**
   * Tapping Call: the details must be filled in first. They are saved while the phone opens
   * the dialer (the page stays open behind the call, so the request still goes through).
   */
  const call = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!category || !problem) return event.preventDefault();
    const missing = name.trim().length < 2 ? t.emergency.needName : !isValidPhone(phone) ? t.misc.phoneInvalid : null;
    if (missing) {
      event.preventDefault();
      setError(p(missing));
      return;
    }
    setError(null);
    report.mutate(
      { category, problem, name: name.trim(), phone: phone.trim(), ...where },
      { onError: (err) => isRateLimited(err) || isNetworkError(err) || console.error(err) },
    );
  };

  const contactFields = (required: boolean) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className={LABEL}>{p(t.emergency.name)}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required={required}
          minLength={required ? 2 : undefined}
          maxLength={255}
          className={INPUT}
        />
      </label>
      <label className="block">
        <span className={LABEL}>{p(t.emergency.phone)}</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required={required}
          maxLength={32}
          placeholder={p(t.book.phonePh)}
          className={INPUT}
        />
      </label>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-24 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-flame text-white shadow-[0_3px_0_#081E42]">
            <Siren className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-black text-navy">{p(t.emergency.title)}</h1>
            <p className="text-sm text-navy/70">{p(t.emergency.intro)}</p>
          </div>
        </div>

        <p role="note" className="mt-5 flex items-start gap-2.5 rounded-2xl border-2 border-red-700 bg-red-700/5 p-4 text-sm font-semibold text-navy">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
          {p(t.emergency.danger)}
        </p>

        <p className="mt-6 font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/60">{step} / 4</p>

        {/* Step 1: the service. Six services: two rows of three (three rows of two on phones). */}
        {step === 1 && (
          <section className="mt-3 animate-rise-in">
            <h2 className="font-display text-xl font-extrabold text-navy">{p(t.emergency.serviceQ)}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {EMERGENCIES.map(({ category: id }) => (
                <button key={id} type="button" onClick={() => go({ cat: id })} className={CHOICE}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flame/10 text-flame">
                    <ServiceIcon id={id} className="h-5 w-5" />
                  </span>
                  {p(CATEGORY_MAP[id].name)}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* The choices so far, each one changeable. */}
        {step > 1 && category && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-navy/15 bg-white p-3">
            <ServiceIcon id={category} className="h-5 w-5 text-flame" />
            <span className="font-display text-sm font-extrabold text-navy">
              {p(CATEGORY_MAP[category].name)}
              {problem && ` · ${p(emergencyLabel(category, problem))}`}
            </span>
            {step === 4 && pin && (
              <span className="inline-flex items-center gap-1 rounded-md bg-navy/[0.06] px-1.5 py-0.5 text-[11px] font-bold text-navy/70">
                <MapPin className="h-3 w-3" />
                {p(t.emergency.locationShared)}
              </span>
            )}
            <button
              type="button"
              onClick={() => go(problem ? { cat: category } : {})}
              className="ms-auto min-h-10 px-2 text-sm font-bold text-flame-ink underline underline-offset-4"
            >
              {p(t.emergency.change)}
            </button>
          </div>
        )}

        {/* Step 2: what's wrong. An even number of each, then "Something else" across the width. */}
        {step === 2 && entry && category && (
          <section className="mt-5 animate-rise-in">
            <h2 className="font-display text-xl font-extrabold text-navy">{p(t.emergency.problemQ)}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {entry.problems.map((x) => (
                <button key={x.id} type="button" onClick={() => go({ cat: category, problem: x.id })} className={CHOICE}>
                  {x.danger && <AlertTriangle className="h-5 w-5 shrink-0 text-red-700" />}
                  {p(x.label)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => go({ cat: category, problem: OTHER_EMERGENCY })}
                className={`${CHOICE} col-span-2 justify-center`}
              >
                {p(t.emergency.other)}
              </button>
            </div>
          </section>
        )}

        {/* Step 3: where you are. Skippable, so a map that won't load never blocks the call. */}
        {step === 3 && category && problem && (
          <section className="mt-5 flex flex-col gap-4 animate-rise-in">
            <div>
              <h2 className="font-display text-xl font-extrabold text-navy">{p(t.emergency.whereQ)}</h2>
              <p className="mt-1 text-sm text-navy/70">{p(t.emergency.whereHint)}</p>
            </div>
            <LocationPicker value={pin} onChange={setPin} />
            <label className="block">
              <span className={LABEL}>{p(t.book.address)}</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="street-address"
                maxLength={1000}
                placeholder={p(t.book.addressPh)}
                className={INPUT}
              />
            </label>
            <button
              type="button"
              onClick={() => go({ cat: category, problem, call: true })}
              disabled={!pin}
              className="btn-pill-primary min-h-14 justify-center text-lg disabled:opacity-40"
            >
              <MapPin className="h-5 w-5" />
              {p(t.emergency.shareAndContinue)}
            </button>
            <button
              type="button"
              onClick={() => go({ cat: category, problem, call: true })}
              className="min-h-11 self-center px-3 text-sm font-bold text-navy/70 underline underline-offset-4"
            >
              {p(t.emergency.skipLocation)}
            </button>
          </section>
        )}

        {/* Step 4: your details, then call. */}
        {step === 4 && (
          <section className="mt-5 flex flex-col gap-4 animate-rise-in">
            {danger && (
              <p role="alert" className="flex items-start gap-2.5 rounded-2xl bg-red-700 p-4 text-sm font-bold text-white">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                {p(t.emergency.sparks)}
              </p>
            )}

            <div className="card-br flex flex-col gap-5 !border-flame p-5 sm:p-6">
              <div>
                <h2 className="font-display text-xl font-extrabold text-navy">{p(t.emergency.callTitle)}</h2>
                <p className="mt-1 text-sm text-navy/70">{p(t.emergency.callBody)}</p>
              </div>

              {/* The number itself, large, so it can also be dialled by hand. */}
              {line ? (
                <a
                  href={telLink(line)}
                  onClick={call}
                  className="flex items-center gap-3 rounded-2xl bg-flame/[0.07] p-4 transition-colors hover:bg-flame/10"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-flame text-white">
                    <PhoneCall className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-navy/55">
                      {p(t.emergency.lineLabel)}
                    </span>
                    <span dir="ltr" className="block font-display text-2xl font-black tracking-tight text-navy sm:text-3xl">
                      {line}
                    </span>
                  </span>
                </a>
              ) : (
                <p className="rounded-2xl border border-dashed border-navy/25 p-4 text-sm font-semibold text-navy/60">
                  {p(t.emergency.lineSoon)}
                </p>
              )}

              {contactFields(true)}

              {error && (
                <p role="alert" className="text-sm font-bold text-red-700">
                  {error}
                </p>
              )}

              {line ? (
                <a href={telLink(line)} onClick={call} className="btn-pill-primary min-h-14 justify-center text-lg">
                  <Phone className="h-5 w-5" />
                  {p(t.emergency.callNowButton)}
                </a>
              ) : (
                <button type="button" disabled className="btn-pill-primary min-h-14 justify-center text-lg opacity-40">
                  <Phone className="h-5 w-5" />
                  {p(t.emergency.callNowButton)}
                </button>
              )}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
