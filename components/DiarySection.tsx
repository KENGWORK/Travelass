"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { apiCreate, apiUpdate } from "@/lib/api";
import { PhotoPicker } from "@/components/PhotoPicker";
import { toast } from "@/components/ui/Toast";
import { tripDays } from "@/lib/days";
import type { Note, Trip } from "@/lib/models/types";

const SAVE_DEBOUNCE_MS = 800;
const SAVED_FADE_MS = 2000;

export function DiarySection({ trip, initialNotes }: { trip: Trip; initialNotes: Note[] }) {
  const days = tripDays(trip.start_date, trip.end_date);

  const [texts, setTexts] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const d of days) out[d.date] = initialNotes.find((n) => n.date === d.date)?.text ?? "";
    return out;
  });
  const [photoIds, setPhotoIds] = useState<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {};
    for (const d of days) out[d.date] = initialNotes.find((n) => n.date === d.date)?.photo_ids ?? [];
    return out;
  });
  const [savedFlags, setSavedFlags] = useState<Record<string, boolean>>({});

  // Each day settles on exactly one note id for this page-load session: the id of an
  // already-fetched note, or a freshly generated one reserved the moment the first save
  // for that day is kicked off. Every subsequent debounced save for that day reuses this
  // same id via apiUpdate — we never re-derive "does a note exist" from possibly-stale
  // fetched state, which is what would let fast typing race two apiCreate calls into
  // duplicate rows. Refs (not state) hold the id/created flag so the value read inside a
  // save is always the latest one, independent of React's render/commit timing.
  const noteIdsRef = useRef<Record<string, string | null>>(
    Object.fromEntries(days.map((d) => [d.date, initialNotes.find((n) => n.date === d.date)?.id ?? null]))
  );
  const createdRef = useRef<Record<string, boolean>>(
    Object.fromEntries(days.map((d) => [d.date, Boolean(initialNotes.find((n) => n.date === d.date))]))
  );
  const textsRef = useRef(texts);
  const photoIdsRef = useRef(photoIds);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedFadeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Tracks the in-flight saveDay() promise per date. A new saveDay(date) call always
  // waits for the previous one for that SAME date to settle before issuing its own
  // apiCreate/apiUpdate — this serializes create-then-update ordering so a fast
  // photo-change save can never race an in-flight text-debounce save (or vice versa)
  // and hit apiUpdate before the row created by apiCreate is actually visible in the
  // sheet. The prior promise's rejection is swallowed here so one date's earlier
  // failure doesn't propagate into (or block) the next save for that date.
  const saveChains = useRef<Record<string, Promise<void>>>({});

  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
      Object.values(savedFadeTimers.current).forEach(clearTimeout);
    };
  }, []);

  const saveDay = (date: string) => {
    const previous = saveChains.current[date] ?? Promise.resolve();
    const run = previous.catch(() => {}).then(() => performSave(date));
    saveChains.current[date] = run;
    return run.catch((err) => {
      console.error(`Failed to save diary entry for ${date}`, err);
      toast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    });
  };

  const performSave = async (date: string) => {
    const text = textsRef.current[date] ?? "";
    const ids = photoIdsRef.current[date] ?? [];

    let noteId = noteIdsRef.current[date];
    if (!noteId) {
      noteId = crypto.randomUUID();
      noteIdsRef.current[date] = noteId; // settle synchronously, before any await
    }
    const payload: Note = { id: noteId, trip_id: trip.id, date, text, photo_ids: ids };

    if (createdRef.current[date]) {
      await apiUpdate<Note>("notes", noteId, payload);
    } else {
      createdRef.current[date] = true; // settle synchronously, before any await
      await apiCreate<Note>("notes", payload);
    }

    setSavedFlags((prev) => ({ ...prev, [date]: true }));
    if (savedFadeTimers.current[date]) clearTimeout(savedFadeTimers.current[date]);
    savedFadeTimers.current[date] = setTimeout(() => {
      setSavedFlags((prev) => ({ ...prev, [date]: false }));
    }, SAVED_FADE_MS);
  };

  const handleTextChange = (date: string, value: string) => {
    textsRef.current = { ...textsRef.current, [date]: value };
    setTexts((prev) => ({ ...prev, [date]: value }));

    if (debounceTimers.current[date]) clearTimeout(debounceTimers.current[date]);
    debounceTimers.current[date] = setTimeout(() => {
      void saveDay(date);
    }, SAVE_DEBOUNCE_MS);
  };

  const handlePhotosChange = (date: string, ids: string[]) => {
    photoIdsRef.current = { ...photoIdsRef.current, [date]: ids };
    setPhotoIds((prev) => ({ ...prev, [date]: ids }));

    // Photo add/remove is a discrete action, not rapid typing — save right away and
    // cancel any pending debounced text save so it doesn't overwrite with stale photo ids.
    if (debounceTimers.current[date]) clearTimeout(debounceTimers.current[date]);
    void saveDay(date);
  };

  return (
    <div className="flex flex-col gap-4">
      {days.map((d) => (
        <div key={d.date} className="rounded-2xl bg-surface shadow-card p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-base font-semibold">{d.label}</h2>
            <AnimatePresence>
              {savedFlags[d.date] && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-xs text-success shrink-0"
                >
                  บันทึกแล้ว ✓
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <textarea
            value={texts[d.date] ?? ""}
            onChange={(e) => handleTextChange(d.date, e.target.value)}
            placeholder="วันนี้เป็นยังไงบ้าง..."
            rows={3}
            className="w-full bg-transparent resize-none text-sm outline-none placeholder:text-muted"
          />

          <div className="grid grid-cols-3 gap-2 rounded-xl">
            <PhotoPicker
              tripName={trip.name}
              kind="photos"
              fileIds={photoIds[d.date] ?? []}
              onChange={(ids) => handlePhotosChange(d.date, ids)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
