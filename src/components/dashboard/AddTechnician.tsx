import { useState, type ReactNode } from "react";
import { CircleCheck, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { PhoneInput } from "@/components/PhoneInput";
import { DistrictPicker } from "@/components/DistrictPicker";
import { CATEGORY_MAP, FACILITY_SERVICES, TRADE_SERVICES } from "@contracts/services";
import { TRANSPORT, TRANSPORT_LABELS, type Transport } from "@contracts/applications";
import { DEFAULT_PHONE_COUNTRY, isValidLocalPhone, joinPhone, type PhoneCountry } from "@contracts/phone";
import type { District } from "@contracts/districts";

const INPUT =
  "mt-1.5 h-10 w-full rounded-lg border border-navy/15 bg-white px-3 text-sm text-navy placeholder:text-navy/35 focus:border-navy/40 focus:outline-none focus:ring-2 focus:ring-flame/20";
const LABEL = "text-xs font-medium text-navy/65";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={LABEL}>
        {label} <span className="text-flame-ink">*</span>
      </span>
      {children}
    </label>
  );
}

/**
 * Admin: add a technician by hand (someone the team already knows), without an application:
 * their account is created and they get an email to set a password; an existing customer
 * account with that email becomes a technician account. Every field is required.
 */
export function AddTechnician({ onClose }: { onClose: () => void }) {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [country, setCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [trade, setTrade] = useState("");
  const [transport, setTransport] = useState<Transport | "">("");
  const [districts, setDistricts] = useState<District[]>([]);
  const add = trpc.join.addTechnician.useMutation({
    onSuccess: () => {
      void utils.tech.list.invalidate();
      void utils.join.list.invalidate();
    },
  });
  const phoneOk = isValidLocalPhone(country, phone);
  const ready =
    name.trim().length >= 2 && phoneOk && EMAIL.test(email.trim()) && !!trade && !!transport && districts.length > 0;

  if (add.data) {
    return (
      <section className="mt-4 rounded-2xl border border-green-700/30 bg-green-700/[0.05] p-4">
        <p className="flex items-start gap-2 text-sm font-semibold text-navy">
          <CircleCheck className="mt-px h-5 w-5 shrink-0 text-green-700" />
          {p(add.data.invited ? t.dash4.addTechInvited : t.dash4.addTechExisting).replace("{email}", add.data.email)}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              add.reset();
              setName("");
              setPhone("");
              setEmail("");
              setTrade("");
              setTransport("");
              setDistricts([]);
            }}
            className="inline-flex h-10 items-center rounded-lg border border-navy/15 bg-white px-4 text-sm font-semibold text-navy hover:bg-navy/5"
          >
            {p(t.dash4.addTechAnother)}
          </button>
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-lg bg-navy px-4 text-sm font-semibold text-white hover:bg-navy/90">
            {p(t.dash4.addTechDone)}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || !transport) return;
        add.mutate({ name: name.trim(), phone: joinPhone(country, phone), email: email.trim(), trade, transport, districts });
      }}
      className="mt-4 rounded-2xl border border-navy/12 bg-white p-4 sm:p-5"
    >
      <h3 className="font-display text-base font-extrabold text-navy">{p(t.dash4.addTech)}</h3>
      <p className="mt-0.5 text-sm text-navy/65">{p(t.dash4.addTechHint)}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={p(t.join.name)}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} autoComplete="off" className={INPUT} />
        </Field>
        <Field label={p(t.join.email)}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            dir="ltr"
            maxLength={320}
            autoComplete="off"
            className={INPUT}
          />
        </Field>
        <div>
          <span className={LABEL}>
            {p(t.join.phone)} <span className="text-flame-ink">*</span>
          </span>
          <div className="mt-1.5">
            <PhoneInput
              id="add-tech-phone"
              country={country}
              onCountry={setCountry}
              value={phone}
              onChange={setPhone}
              invalid={phone.trim() !== "" && !phoneOk}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={p(t.dash4.addTechTrade)}>
            <select value={trade} onChange={(e) => setTrade(e.target.value)} className={INPUT}>
              <option value="" disabled>
                {p(t.dash4.addTechChoose)}
              </option>
              {[...TRADE_SERVICES, ...FACILITY_SERVICES].map((id) =>
                CATEGORY_MAP[id] ? (
                  <option key={id} value={id}>
                    {p(CATEGORY_MAP[id].name)}
                  </option>
                ) : null,
              )}
            </select>
          </Field>
          <Field label={p(t.techInfo.transport)}>
            <select value={transport} onChange={(e) => setTransport(e.target.value as Transport)} className={INPUT}>
              <option value="" disabled>
                {p(t.dash4.addTechChoose)}
              </option>
              {TRANSPORT.map((m) => (
                <option key={m} value={m}>
                  {p(TRANSPORT_LABELS[m])}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <p id="add-tech-districts" className={`${LABEL} mt-4`}>
        {p(t.dash4.addTechDistricts)} <span className="text-flame-ink">*</span>
      </p>
      <div className="mt-1.5">
        <DistrictPicker value={districts} onChange={setDistricts} compact labelledBy="add-tech-districts" />
      </div>

      {add.error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-700">
          {add.error.message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center rounded-lg border border-navy/15 px-4 text-sm font-semibold text-navy hover:bg-navy/5"
        >
          {p(t.techInfo.cancel)}
        </button>
        <button
          type="submit"
          disabled={!ready || add.isPending}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-navy px-4 text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
        >
          {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {p(t.dash4.addTechSubmit)}
        </button>
      </div>
    </form>
  );
}
