// The booking's state and sending (src/pages/Book.tsx shows it, a step at a time).

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useI18n } from "@/i18n";
import { useRoleGate } from "@/hooks/useRoleGate";
import { trpc } from "@/providers/trpc";
import { uploadToSignedTarget } from "@/lib/upload";
import { type Pin } from "@/components/map/LocationPicker";
import { isValidPin } from "@contracts/geo";
import { isValidPhone } from "@contracts/phone";
import { isNetworkError, isRateLimited, refusalMessage } from "@/lib/errors";
import {
  clearDraft,
  loadDraftFields,
  loadDraftFiles,
  saveDraftFields,
  saveDraftFiles,
} from "@/lib/bookingDraft";
import { CATEGORY_MAP } from "@contracts/services";
import {
  answersFromLink,
  isHourlyService,
  isValidHours,
  isValidVisitDate,
  MAX_BOOKING_FILES,
  MAX_BOOKING_VIDEOS,
  slotOfHour,
  TIME_SLOTS,
  todayHere,
  type TimeSlot,
} from "@contracts/workflow";
import { shrinkImage } from "@/lib/shrinkImage";

/** A photo/video kept on the device until the request is submitted. */
type MediaDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

function toMediaDraft(file: File): MediaDraft {
  return { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) };
}

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const STEPS = ["stepCategory", "stepQuestions", "stepPhotos", "stepWhen", "stepReview"] as const;

/**
 * Everything the booking page keeps while the customer goes through the steps: the answers,
 * photos, date and place (saved as a draft, restored after signing in), and sending it all.
 */
export function useBookingForm() {
  const { t, p } = useI18n();
  // Visitors can fill everything in; staff accounts are sent to their workspace.
  const { user, isAuthenticated, isLoading: authLoading } = useRoleGate(["customer"]);
  const [params] = useSearchParams();

  const initialCat = params.get("cat") ?? "";
  // The home page's service picker hands over the problem and the area.
  const fromPicker = params.has("ans") || params.has("area");
  // Restore an unfinished booking (e.g. after returning from the sign-in email link),
  // unless the visitor came in for a different service or picked a new problem.
  const [draft] = useState(() => {
    const d = loadDraftFields();
    if (d && fromPicker) return null;
    if (d && initialCat && CATEGORY_MAP[initialCat] && d.category !== initialCat) return null;
    return d;
  });
  const [step, setStep] = useState(
    draft?.step ?? (initialCat && CATEGORY_MAP[initialCat] ? 1 : 0),
  );
  const [category, setCategory] = useState(
    draft?.category ?? (initialCat && CATEGORY_MAP[initialCat] ? initialCat : ""),
  );
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => draft?.answers ?? answersFromLink(initialCat, params.get("ans")),
  );
  const [media, setMedia] = useState<MediaDraft[]>([]);
  const [uploadError, setUploadError] = useState<"file" | "videos" | null>(null);
  const [preparingFiles, setPreparingFiles] = useState(false);
  const [date, setDate] = useState(draft?.date ?? "");
  const [slot, setSlot] = useState<TimeSlot | "">(
    TIME_SLOTS.includes(draft?.slot as TimeSlot) ? (draft!.slot as TimeSlot) : "",
  );
  // Services booked by the hour (Cleaning, Porter): from when to when.
  const [fromHour, setFromHour] = useState<number | "">(draft?.hours?.from ?? "");
  const [toHour, setToHour] = useState<number | "">(draft?.hours?.to ?? "");
  const [area, setArea] = useState(draft?.area ?? (params.get("area") ?? "").trim().slice(0, 255));
  const [address, setAddress] = useState(draft?.address ?? "");
  const [phone, setPhone] = useState(draft?.phone ?? "");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [pin, setPin] = useState<Pin | null>(draft?.pin ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  /** Shown under the submit button; already translated. */
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cat = category ? CATEGORY_MAP[category] : null;
  const questions = useMemo(
    () =>
      (cat?.questions ?? []).filter(
        (q) => !q.when || answers[q.when.id] === q.when.equals,
      ),
    [cat, answers],
  );

  const createUpload = trpc.storage.createUpload.useMutation();
  const createMutation = trpc.requests.create.useMutation();
  const acceptTerms = trpc.auth.acceptTerms.useMutation();
  // Accounts created before the sign-up checkbox (or Google sign-in) accept once here.
  const needsTerms = isAuthenticated && !user?.termsAcceptedAt;
  const [agreedNow, setAgreedNow] = useState(false);


  // The number to call for this visit, typed by the customer: never filled in from the account
  // (they may be booking for someone else's home or their office).
  const contactPhone = phone;
  // Only complain once something is typed.
  const phoneInvalid = contactPhone.trim() !== "" && !isValidPhone(contactPhone);
  // A draft saved yesterday can carry yesterday's date.
  const dateInvalid = date !== "" && !isValidVisitDate(date, todayHere());
  const hourly = isHourlyService(category);
  const hoursOk = fromHour !== "" && toHour !== "" && isValidHours(fromHour, toHour);
  const detailsReady =
    !!date && !dateInvalid && (hourly ? hoursOk : !!slot) && !!area.trim() && !!address.trim() && isValidPhone(contactPhone) && !!pin && isValidPin(pin.lat, pin.lng);

  /* ---------- draft persistence ---------- */
  const filesRestored = useRef(false);
  useEffect(() => {
    let cancelled = false;
    if (!draft) {
      filesRestored.current = true;
      void saveDraftFiles([]); // drop photos left over from an older, expired draft
      return;
    }
    loadDraftFiles().then((files) => {
      if (cancelled) return;
      filesRestored.current = true;
      setMedia(files.map(toMediaDraft));
    });
    return () => {
      cancelled = true;
    };
  }, [draft]);

  useEffect(() => {
    if (doneId !== null || !category) return;
    saveDraftFields({ step, category, answers, date, slot, hours: { from: fromHour, to: toHour }, area, address, phone, notes, pin });
  }, [doneId, step, category, answers, date, slot, fromHour, toHour, area, address, phone, notes, pin]);

  useEffect(() => {
    if (filesRestored.current && doneId === null) void saveDraftFiles(media.map((m) => m.file));
  }, [media, doneId]);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, MAX_BOOKING_FILES - media.length);
    if (fileRef.current) fileRef.current.value = "";
    setUploadError(null);
    setPreparingFiles(true);
    let videos = media.filter((m) => m.file.type.startsWith("video/")).length;
    const accepted: MediaDraft[] = [];
    for (const original of picked) {
      if (original.type.startsWith("video/") && ++videos > MAX_BOOKING_VIDEOS) {
        setUploadError("videos");
        continue;
      }
      // Photos are shrunk on the phone: faster uploads on mobile data, less storage.
      const file = await shrinkImage(original);
      if (file.size > MAX_FILE_BYTES || !/^(image|video)\//.test(file.type)) {
        setUploadError("file");
        continue;
      }
      accepted.push(toMediaDraft(file));
    }
    setMedia((m) => [...m, ...accepted]);
    setPreparingFiles(false);
  }

  function questionsAnswered() {
    return questions.every((q) => answers[q.id]);
  }

  async function submit() {
    if (needsTerms && !agreedNow) return;
    setSubmitError(null);
    // Re-check before sending: a restored draft can be out of date (yesterday's date,
    // a short phone saved at sign-up, questions that changed). Go back to the step to fix.
    const fixAt = !category ? 0 : !questionsAnswered() ? 1 : !detailsReady ? 3 : null;
    if (fixAt !== null) {
      setStep(fixAt);
      setSubmitError(p(t.book.fixDetails));
      return;
    }
    setSubmitting(true);
    let uploading = false;
    try {
      if (needsTerms) await acceptTerms.mutateAsync();
      // Photos are uploaded only now that we know who the customer is.
      const uploaded = [];
      for (const [i, m] of media.entries()) {
        setUploadProgress({ done: i, total: media.length });
        const contentType = m.file.type || "application/octet-stream";
        uploading = true;
        const target = await createUpload.mutateAsync({
          fileName: m.file.name,
          size: m.file.size,
          contentType,
        });
        await uploadToSignedTarget(target, m.file, contentType);
        uploaded.push({ key: target.key, fileName: m.file.name, size: m.file.size, contentType });
      }
      uploading = false;
      setUploadProgress(null);
      const res = await createMutation.mutateAsync({
        category,
        answers,
        preferredDate: date,
        // the "Next" button requires a slot, or valid hours for a service booked by the hour
        timeSlot: hourly && hoursOk ? slotOfHour(fromHour as number) : (slot as TimeSlot),
        hours: hourly && hoursOk ? { from: fromHour as number, to: toHour as number } : undefined,
        area,
        address,
        lat: pin!.lat, // the "Next" button requires a pin
        lng: pin!.lng,
        phone: contactPhone,
        notes: notes || undefined,
        media: uploaded,
      });
      await clearDraft();
      setDoneId(res.id);
    } catch (err) {
      const reason = refusalMessage(err);
      setSubmitError(
        isRateLimited(err)
          ? p(t.misc.tooMany)
          : isNetworkError(err)
            ? p(t.misc.offline)
            : uploading
              ? p(t.book.photoUploadFailed)
              : reason
                ? p(t.book.refused).replace("{reason}", reason)
                : p(t.misc.error),
      );
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  return {
    user,
    isAuthenticated,
    authLoading,
    step,
    setStep,
    category,
    setCategory,
    answers,
    setAnswers,
    media,
    setMedia,
    uploadError,
    preparingFiles,
    fileRef,
    onFiles,
    date,
    setDate,
    slot,
    setSlot,
    fromHour,
    setFromHour,
    toHour,
    setToHour,
    area,
    setArea,
    address,
    setAddress,
    phone,
    setPhone,
    notes,
    setNotes,
    pin,
    setPin,
    cat,
    questions,
    questionsAnswered,
    contactPhone,
    phoneInvalid,
    dateInvalid,
    hourly,
    hoursOk,
    detailsReady,
    needsTerms,
    agreedNow,
    setAgreedNow,
    submitting,
    uploadProgress,
    submitError,
    setSubmitError,
    doneId,
    submit,
  };
}

export type BookingForm = ReturnType<typeof useBookingForm>;
