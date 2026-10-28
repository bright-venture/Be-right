import { useI18n } from "@/i18n";
import LocationPicker from "@/components/map/LocationPicker";
import { HOURS_CLOSE, HOURS_OPEN, todayHere } from "@contracts/workflow";
import { hourText, hoursCount } from "@contracts/visitTime";
import type { BookingForm } from "./useBookingForm";

/** Step 4: when (a time of day, or hours) and where (pin, address, phone). */
export function StepWhenWhere({ form }: { form: BookingForm }) {
  const { t, p } = useI18n();
  const { date, setDate, slot, setSlot, fromHour, setFromHour, toHour, setToHour, area, setArea, address, setAddress, setPhone, notes, setNotes, pin, setPin, contactPhone, phoneInvalid, dateInvalid, hourly, hoursOk } = form;
  return (
    <div className="flex flex-col gap-5">
      <div className="card-br p-5">
        <label className="font-display text-base font-extrabold text-navy">
          {p(t.book.date)}
        </label>
        <input
          type="date"
          value={date}
          min={todayHere()}
          onChange={(e) => setDate(e.target.value)}
          aria-invalid={dateInvalid || undefined}
          className="mt-2 min-h-12 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 font-semibold text-navy focus:border-flame focus:outline-none"
        />
        {dateInvalid && <p className="mt-1 text-sm font-semibold text-destructive">{p(t.book.datePast)}</p>}
        {hourly ? (
          <div className="mt-4">
            <p className="font-display text-base font-extrabold text-navy">{p(t.book.hoursTitle)}</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(
                [
                  [t.book.hoursFrom, fromHour, HOURS_OPEN, HOURS_CLOSE - 1],
                  [t.book.hoursTo, toHour, fromHour === "" ? HOURS_OPEN + 1 : fromHour + 1, HOURS_CLOSE],
                ] as const
              ).map(([label, value, first, last], i) => (
                <label key={i} className="flex flex-col gap-1 text-sm font-bold text-navy">
                  {p(label)}
                  <select
                    value={value}
                    onChange={(e) => {
                      const hour = e.target.value === "" ? "" : Number(e.target.value);
                      if (i === 1) return setToHour(hour);
                      setFromHour(hour);
                      // an end before the new start no longer fits
                      if (hour !== "" && toHour !== "" && toHour <= hour) setToHour("");
                    }}
                    className="min-h-12 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 font-semibold text-navy focus:border-flame focus:outline-none"
                  >
                    <option value="">{p(t.book.hoursPick)}</option>
                    {Array.from({ length: last - first + 1 }, (_, k) => first + k).map((h) => (
                      <option key={h} value={h}>
                        {p(hourText(h))}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {hoursOk && (
              <p className="mt-2 text-sm font-bold text-bird">{p(hoursCount((toHour as number) - (fromHour as number)))}</p>
            )}
          </div>
        ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { v: "morning" as const, l: t.book.slotMorning },
            { v: "afternoon" as const, l: t.book.slotAfternoon },
            { v: "evening" as const, l: t.book.slotEvening },
          ].map((s) => (
            <button
              key={s.v}
              onClick={() => setSlot(s.v)}
              className={`min-h-11 rounded-full border-2 px-5 py-2 text-sm font-bold transition-all ${
                slot === s.v
                  ? "border-navy bg-navy text-paper"
                  : "border-navy/30 bg-white text-navy hover:border-navy"
              }`}
            >
              {p(s.l)}
            </button>
          ))}
        </div>
        )}
      </div>

      <div className="card-br p-5">
        <p className="font-display text-base font-extrabold text-navy">
          {p(t.map.pinTitle)} <span className="text-flame-ink">*</span>
        </p>
        <div className="mt-3">
          <LocationPicker value={pin} onChange={setPin} />
        </div>
      </div>

      <div className="card-br flex flex-col gap-4 p-5">
        {[
          { l: t.book.area, v: area, set: setArea, ph: p(t.book.areaPh) },
          { l: t.book.address, v: address, set: setAddress, ph: p(t.book.addressPh) },
          { l: t.book.phone, v: contactPhone, set: setPhone, ph: p(t.book.phonePh), tel: true },
        ].map((f, i) => (
          <div key={i}>
            <label className="font-display text-base font-extrabold text-navy">
              {p(f.l)}
            </label>
            <input
              value={f.v}
              onChange={(e) => f.set(e.target.value)}
              placeholder={f.ph}
              {...(f.tel && { type: "tel", autoComplete: "tel", dir: "ltr" })}
              aria-invalid={f.tel && phoneInvalid ? true : undefined}
              className="mt-2 min-h-12 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none"
            />
            {f.tel && phoneInvalid && (
              <p className="mt-1 text-sm font-semibold text-destructive">{p(t.misc.phoneInvalid)}</p>
            )}
          </div>
        ))}
        <div>
          <label className="font-display text-base font-extrabold text-navy">
            {p(t.book.notes)}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={p(t.book.notesPh)}
            rows={3}
            className="mt-2 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 py-3 font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
