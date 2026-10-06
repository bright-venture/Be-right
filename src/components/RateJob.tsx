import { useState } from "react";
import { Loader2, Star } from "lucide-react";
import { Stars } from "@/components/Stars";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { refusalMessage } from "@/lib/errors";

/** "How was the job?" after a completed job; one rating per request. */
export function RateJob({ requestId, rated }: { requestId: number; rated: boolean }) {
  const { t, p } = useI18n();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const utils = trpc.useUtils();
  const submit = trpc.reviews.submit.useMutation({
    onSuccess: () => utils.requests.get.invalidate(),
  });

  if (rated) {
    return (
      <p className="mt-6 inline-flex items-center gap-2 rounded-full border-2 border-green-700 bg-green-700/10 px-4 py-2 text-sm font-bold text-green-800">
        <Star className="h-4 w-4" fill="currentColor" aria-hidden />
        {p(t.rating.thanks)}
      </p>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border-2 border-flame bg-flame/5 p-4">
      <p className="font-display text-sm font-extrabold text-navy">{p(t.rating.prompt)}</p>
      <Stars value={rating} onChange={setRating} size={28} className="mt-2" />
      {rating > 0 && (
        <div className="mt-3 flex flex-col gap-2 animate-rise-in">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={p(t.rating.commentPh)}
            aria-label={p(t.rating.commentPh)}
            maxLength={2000}
            className="w-full rounded-2xl border-2 border-navy/20 bg-white px-4 py-2.5 text-sm font-medium text-navy outline-none placeholder:text-navy/40 focus:border-navy"
          />
          <button
            onClick={() => submit.mutate({ requestId, rating, comment: comment.trim() || undefined })}
            disabled={submit.isPending}
            className="btn-pill-primary w-fit !px-5 !py-2"
          >
            {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {p(t.rating.submit)}
          </button>
          {submit.error && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {refusalMessage(submit.error) ?? p(t.misc.error)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
