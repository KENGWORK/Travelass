"use client";
import { useEffect, useMemo, useState } from "react";
import { Volume2, MoreHorizontal, Plus, Languages, Sparkles } from "lucide-react";
import { apiCreate, apiDelete, apiList, apiUpdate } from "@/lib/api";
import { optimisticCreate, optimisticUpdate, optimisticDelete } from "@/lib/optimistic";
import { Chip } from "@/components/ui/Chip";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/components/ui/Toast";
import { PhraseFormSheet, type PhraseFormValues } from "@/components/PhraseFormSheet";
import { PHRASE_CATEGORIES, PHRASE_SEED } from "@/lib/phrase-seed";
import type { Phrase } from "@/lib/models/types";

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

// getVoices() can return an empty list on first call (iOS Safari loads them
// async) -- wait for voiceschanged once, then cache for every later speak().
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!voicesReady) {
    voicesReady = new Promise((resolve) => {
      const existing = window.speechSynthesis.getVoices();
      if (existing.length > 0) {
        resolve(existing);
        return;
      }
      window.speechSynthesis.onvoiceschanged = () => resolve(window.speechSynthesis.getVoices());
    });
  }
  return voicesReady;
}

async function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    toast("อุปกรณ์นี้ไม่รองรับการอ่านออกเสียง");
    return;
  }
  window.speechSynthesis.cancel();
  // iOS Safari sometimes leaves speechSynthesis stuck "paused" after the tab
  // is backgrounded and foregrounded again -- speak() silently no-ops unless
  // resume() runs first.
  window.speechSynthesis.resume();

  const voices = await loadVoices();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "zh-CN";
  const zhVoice = voices.find((v) => v.lang.toLowerCase().startsWith("zh"));
  if (zhVoice) {
    utter.voice = zhVoice;
  } else if (voices.length > 0) {
    // Voices loaded fine, just none for Chinese -- iOS needs the voice pack
    // downloaded manually (Settings > Accessibility > Spoken Content > Voices),
    // unlike desktop browsers which usually ship it built in.
    toast("อุปกรณ์นี้ไม่มีเสียงพูดภาษาจีน ลองเพิ่มใน Settings > การช่วยการเข้าถึง > เนื้อหาพูด > เสียง");
  }
  window.speechSynthesis.speak(utter);
}

export function PhraseSection({ tripId }: { tripId: string }) {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Phrase | null>(null);

  useEffect(() => {
    apiList<Phrase>("phrases", tripId).then((list) => {
      setPhrases(list);
      setLoading(false);
    });
  }, [tripId]);

  const categoriesPresent = useMemo(
    () => PHRASE_CATEGORIES.filter((c) => phrases.some((p) => p.category === c)),
    [phrases],
  );
  const visible = filter ? phrases.filter((p) => p.category === filter) : phrases;

  const seed = async () => {
    setSeeding(true);
    const newRows: Phrase[] = PHRASE_SEED.map((p) => ({ id: crypto.randomUUID(), trip_id: tripId, ...p }));
    setPhrases((prev) => [...prev, ...newRows]);
    try {
      await Promise.all(newRows.map((row) => apiCreate<Phrase>("phrases", row)));
      toast(`เพิ่มชุดคำเริ่มต้น ${newRows.length} คำแล้ว`);
    } catch {
      toast("โหลดชุดคำไม่สำเร็จ ลองอีกครั้ง", "error");
    } finally {
      setSeeding(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (p: Phrase) => {
    setEditing(p);
    setSheetOpen(true);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("คัดลอกแล้ว");
    } catch {
      toast("คัดลอกไม่สำเร็จ");
    }
  };

  const handleSave = (values: PhraseFormValues) => {
    if (editing) {
      const patch = { ...editing, ...values };
      optimisticUpdate(setPhrases, editing.id, patch, () => apiUpdate<Phrase>("phrases", editing.id, patch));
    } else {
      const newPhrase: Phrase = { id: crypto.randomUUID(), trip_id: tripId, ...values };
      optimisticCreate(setPhrases, newPhrase, () => apiCreate<Phrase>("phrases", newPhrase));
    }
  };

  const handleDelete = () => {
    if (!editing) return;
    optimisticDelete(setPhrases, editing.id, () => apiDelete("phrases", editing.id));
    setSheetOpen(false);
    toast("ลบแล้ว");
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {phrases.length === 0 ? (
        <EmptyState icon={Languages} title="ยังไม่มีวลี" subtitle="โหลดชุดคำเริ่มต้น หรือเพิ่มวลีของคุณเอง" />
      ) : (
        categoriesPresent.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <Chip selected={filter === null} onClick={() => setFilter(null)}>
              ทั้งหมด
            </Chip>
            {categoriesPresent.map((c) => (
              <Chip key={c} selected={filter === c} onClick={() => setFilter(c)}>
                {c}
              </Chip>
            ))}
          </div>
        )
      )}

      {visible.map((p) => (
        <div key={p.id} className="rounded-2xl bg-surface shadow-card p-3 flex items-start gap-3">
          <button type="button" onClick={() => copyText(p.text)} className="press flex-1 min-w-0 text-left cursor-pointer">
            <span className="text-xs text-muted">{p.category}</span>
            <p className="text-lg font-medium">{p.text}</p>
            {p.pronunciation && <p className="text-sm text-primary">{p.pronunciation}</p>}
            {p.meaning && <p className="text-sm text-muted">{p.meaning}</p>}
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              aria-label="ฟังเสียง"
              onClick={() => speak(p.text)}
              className="w-11 h-11 grid place-items-center text-primary cursor-pointer"
            >
              <Volume2 size={20} />
            </button>
            <button
              type="button"
              aria-label="ตัวเลือกเพิ่มเติม"
              onClick={() => openEdit(p)}
              className="w-11 h-11 grid place-items-center text-muted cursor-pointer"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={openCreate}
          className="flex-1 h-14 rounded-2xl border-2 border-dashed border-muted/30 text-muted flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus size={18} />
          เพิ่มวลี
        </button>
        <button
          type="button"
          onClick={seed}
          disabled={seeding}
          className="h-14 px-4 rounded-2xl bg-primary-soft text-primary font-medium flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
        >
          <Sparkles size={18} />
          โหลดชุดคำเริ่มต้น
        </button>
      </div>

      <PhraseFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        phrase={editing}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined}
      />
    </div>
  );
}
