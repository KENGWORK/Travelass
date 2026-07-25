"use client";
import { useEffect, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, NotebookPen, Plus } from "lucide-react";
import { apiCreate, apiDelete, apiList, apiUpdate } from "@/lib/api";
import { optimisticCreate, optimisticDelete } from "@/lib/optimistic";
import { PhotoPicker } from "@/components/PhotoPicker";
import { PhotoViewer } from "@/components/PhotoViewer";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { photoUrl } from "@/lib/photo-url";
import type { QuickNote } from "@/lib/models/types";

function PhotoStrip({ fileIds }: { fileIds: string[] }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (fileIds.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
      {fileIds.map((id, i) => (
        <button key={id} type="button" aria-label="ดูรูป" onClick={() => setViewerIndex(i)}
          className="h-20 w-20 rounded-xl overflow-hidden shrink-0 cursor-pointer">
          <img src={photoUrl(id)} alt="" className="w-full h-full object-cover" />
        </button>
      ))}
      {viewerIndex !== null && (
        <PhotoViewer fileIds={fileIds} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </div>
  );
}

// Same drag-vs-scroll fix as itinerary/quickinfo this session: whole-card
// drag fights vertical page scroll on touch, so the card only listens via a
// dedicated handle strip on the right edge (dragListener={false} +
// useDragControls, one hook instance per row since hooks can't run inside
// the .map() below).
function QuickNoteCard({ note, onDragEnd, onEdit }: { note: QuickNote; onDragEnd: () => void; onEdit: (n: QuickNote) => void }) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item value={note} dragListener={false} dragControls={dragControls} onDragEnd={onDragEnd} className="list-none">
      <div className="rounded-2xl bg-surface shadow-card flex items-stretch overflow-hidden">
        <button type="button" onClick={() => onEdit(note)} className="press flex-1 min-w-0 text-left cursor-pointer p-3 flex flex-col gap-2">
          <span className="font-medium">{note.title}</span>
          {note.content && <p className="text-sm text-muted whitespace-pre-wrap break-words">{note.content}</p>}
          <PhotoStrip fileIds={note.photo_ids} />
        </button>
        <button type="button" aria-label="ลากจัดลำดับ"
          onPointerDown={(e) => { e.stopPropagation(); dragControls.start(e); }}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 px-3 flex items-center text-muted/50 cursor-grab active:cursor-grabbing touch-none">
          <GripVertical size={18} />
        </button>
      </div>
    </Reorder.Item>
  );
}

export function QuickNotesSection({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<QuickNote | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [photoIds, setPhotoIds] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    apiList<QuickNote>("quicknotes", tripId).then((list) => {
      if (!alive) return;
      setNotes(list.slice().sort((a, b) => a.sort_order - b.sort_order));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [tripId]);

  // Same pattern as the itinerary page's persistOrder: bake the new
  // positions into sort_order, update local state immediately, sync in the
  // background. Reorder is low-stakes -- a stuck order just needs a refresh.
  const persistOrder = (newNotes: QuickNote[]) => {
    const changed = newNotes.filter((n, idx) => n.sort_order !== idx);
    if (changed.length === 0) return;
    const reordered = newNotes.map((n, idx) => ({ ...n, sort_order: idx }));
    setNotes(reordered);
    Promise.all(
      reordered.filter((n) => changed.some((c) => c.id === n.id)).map((n) => apiUpdate<QuickNote>("quicknotes", n.id, n)),
    ).catch(() => toast("บันทึกลำดับไม่สำเร็จ ลองอีกครั้ง", "error"));
  };

  const openCreate = () => {
    setEditing(null);
    setTitle(""); setContent(""); setPhotoIds([]);
    setSheetOpen(true);
  };
  const openEdit = (n: QuickNote) => {
    setEditing(n);
    setTitle(n.title); setContent(n.content); setPhotoIds(n.photo_ids);
    setSheetOpen(true);
  };

  const save = () => {
    if (!title.trim()) {
      toast("กรอกหัวข้อก่อน");
      return;
    }
    if (editing) {
      const patch: QuickNote = { ...editing, title: title.trim(), content, photo_ids: photoIds };
      setNotes((prev) => prev.map((n) => (n.id === editing.id ? patch : n)));
      apiUpdate<QuickNote>("quicknotes", editing.id, patch).catch(() => toast("บันทึกไม่สำเร็จ ลองอีกครั้ง", "error"));
    } else {
      const newNote: QuickNote = { id: crypto.randomUUID(), trip_id: tripId, title: title.trim(), content, photo_ids: photoIds, sort_order: notes.length };
      optimisticCreate(setNotes, newNote, () => apiCreate("quicknotes", newNote));
    }
    setSheetOpen(false);
  };

  const remove = () => {
    if (!editing) return;
    optimisticDelete(setNotes, editing.id, () => apiDelete("quicknotes", editing.id));
    setSheetOpen(false);
    toast("ลบแล้ว");
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.length === 0 && <EmptyState icon={NotebookPen} title="ยังไม่มีโน้ต — จดอะไรก็ได้ที่อยากเก็บไว้" />}

      {notes.length > 0 && (
        <Reorder.Group axis="y" values={notes} onReorder={setNotes} className="flex flex-col gap-3 list-none">
          {notes.map((n) => (
            <QuickNoteCard key={n.id} note={n} onDragEnd={() => persistOrder(notes)} onEdit={openEdit} />
          ))}
        </Reorder.Group>
      )}

      <button type="button" onClick={openCreate}
        className="h-14 rounded-2xl border-2 border-dashed border-muted/30 text-muted flex items-center justify-center gap-2 cursor-pointer">
        <Plus size={18} />
        เพิ่ม
      </button>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={editing ? "แก้ไข" : "เพิ่มโน้ต"}>
        <div className="flex flex-col gap-3">
          <FormField label="หัวข้อ">
            <input className="field" placeholder="เช่น เบอร์โรงแรม" value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label="เนื้อหา">
            <textarea className="field" rows={4} placeholder="รายละเอียด" value={content} onChange={(e) => setContent(e.target.value)} />
          </FormField>
          <FormField label="รูปภาพ">
            <PhotoPicker tripName={tripName} kind="photos" fileIds={photoIds} onChange={setPhotoIds} />
          </FormField>
          <div className="flex gap-2 mt-2">
            {editing && (
              <Button variant="secondary" className="text-danger" onClick={remove}>
                ลบ
              </Button>
            )}
            <Button full variant="primary" onClick={save}>
              บันทึก
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
