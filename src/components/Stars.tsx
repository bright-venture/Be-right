import { Star } from "lucide-react";

/** Five stars: a read-only average (halves allowed) or, with onChange, a 1–5 picker. */
export function Stars({
  value,
  onChange,
  size = 20,
  className = "",
}: {
  value: number; // 0..5
  onChange?: (v: number) => void;
  size?: number;
  className?: string;
}) {
  const interactive = !!onChange;
  const star = (i: number) => {
    const fill = Math.max(0, Math.min(1, value - (i - 1)));
    return (
      <>
        <Star style={{ width: size, height: size }} className="text-navy/20" fill="currentColor" aria-hidden />
        <span className="absolute inset-0 overflow-hidden rtl:rotate-180" style={{ width: `${fill * 100}%` }}>
          <Star style={{ width: size, height: size }} className="text-flame" fill="currentColor" aria-hidden />
        </span>
      </>
    );
  };

  if (!interactive) {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`} role="img" aria-label={`${value.toFixed(1)} / 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="relative">
            {star(i)}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} role="group" aria-label="1–5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          aria-pressed={value === i}
          aria-label={`${i} / 5`}
          className="relative transition-transform hover:scale-110"
        >
          {star(i)}
        </button>
      ))}
    </span>
  );
}
