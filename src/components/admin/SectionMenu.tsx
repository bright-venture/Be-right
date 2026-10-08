import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";

type Option<T extends string> = { value: T; label: string; badge?: number };

/**
 * A section picker in Be Right's own style (the browser's dropdown list can't be styled): a
 * pill button that opens a rounded list, the current section ticked. Keyboard: arrows move,
 * Enter or Space picks, Escape closes.
 */
export function SectionMenu<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  // A tap or click anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  function show() {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function pick(option: Option<T>) {
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    }
    if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      pick(options[active]);
    }
  }

  const badge = (n: number | undefined, onDark = false) =>
    n ? (
      <span
        className={`rounded-full px-2 py-px text-[11px] font-black tabular-nums ${onDark ? "bg-paper text-navy" : "bg-flame text-white"}`}
      >
        {n}
      </span>
    ) : null;

  return (
    <div ref={root} className="relative flex items-center gap-3">
      <span className="shrink-0 text-sm font-bold text-navy/70">{label}</span>
      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={onKeyDown}
          className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border-2 bg-white px-4 text-start font-display text-base font-extrabold text-navy transition-colors focus-visible:outline-none ${
            open ? "border-flame" : "border-navy hover:border-navy/70 focus-visible:border-flame"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{current.label}</span>
            {badge(current.badge)}
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute inset-x-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-navy/15 bg-white p-1.5 shadow-[0_12px_32px_rgb(12_43_92/0.16)]"
          >
            {options.map((option, i) => {
              const selected = option.value === value;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={selected}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(option)}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-sm transition-colors ${
                    selected ? "bg-navy font-bold text-paper" : i === active ? "bg-paper font-semibold text-navy" : "font-semibold text-navy"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {option.label}
                    {badge(option.badge, selected)}
                  </span>
                  {selected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
