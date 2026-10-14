import { ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n";
import { PHONE_COUNTRIES, type PhoneCountry } from "@contracts/phone";

/**
 * A phone number with its country code chosen in front (Lebanon, +961, by default), so
 * people type the number the way they say it. Join the two with `joinPhone`.
 */
export function PhoneInput({
  country,
  onCountry,
  value,
  onChange,
  onBlur,
  invalid,
  id,
}: {
  country: PhoneCountry;
  onCountry: (country: PhoneCountry) => void;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  id?: string;
}) {
  const { t, p } = useI18n();
  const dial = PHONE_COUNTRIES.find((c) => c.id === country)?.dial;
  return (
    <div
      dir="ltr"
      className={`mt-2 flex min-h-12 w-full overflow-hidden rounded-2xl border-2 bg-white focus-within:border-flame ${
        invalid ? "border-red-700" : "border-navy/30"
      }`}
    >
      {/* The code shows plainly; the native list opens on top of it (country names in the list). */}
      <span className="relative flex shrink-0 items-center gap-1 border-e-2 border-navy/15 bg-navy/[0.04] ps-4 pe-3 font-semibold text-navy">
        {dial}
        <ChevronDown className="h-4 w-4 text-navy/50" />
        <select
          value={country}
          onChange={(e) => onCountry(e.target.value as PhoneCountry)}
          aria-label={p(t.misc.countryCode)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.id} value={c.id}>
              {p(c.name)} ({c.dial})
            </option>
          ))}
        </select>
      </span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        type="tel"
        inputMode="tel"
        maxLength={24}
        autoComplete="tel-national"
        aria-invalid={invalid ? true : undefined}
        className="min-w-0 flex-1 bg-transparent px-4 font-semibold text-navy focus:outline-none"
      />
    </div>
  );
}
