"use client";
import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { PhotoViewer } from "@/components/PhotoViewer";
import { toast } from "@/components/ui/Toast";
import { photoUrl } from "@/lib/photo-url";
import { uploadPhoto } from "@/lib/upload-photo";
import { isGoogleConfigured } from "@/lib/backend";

export interface PhotoPickerProps {
  tripName: string;
  kind: "photos" | "slips";
  fileIds: string[];
  onChange: (fileIds: string[]) => void;
}

export function PhotoPicker({ tripName, kind, fileIds, onChange }: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Delete is destructive and irreversible (the slip/photo is gone, and any
  // history that referenced it goes with it) -- confirm before it happens
  // instead of removing on the first tap.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploadingCount((n) => n + list.length);
    const accumulated = [...fileIds];
    for (const file of list) {
      try {
        const id = await uploadPhoto(file, tripName, kind);
        accumulated.push(id);
        onChange([...accumulated]);
      } catch {
        toast(isGoogleConfigured() ? "อัปโหลดรูปไม่สำเร็จ" : "อ่านรูปไม่สำเร็จ");
      } finally {
        setUploadingCount((n) => Math.max(0, n - 1));
      }
    }
  };

  const confirmRemove = () => {
    if (!confirmId) return;
    onChange(fileIds.filter((f) => f !== confirmId));
    setConfirmId(null);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        aria-label="ถ่ายรูปหรือเลือกรูป"
        onClick={() => inputRef.current?.click()}
        className="h-20 w-20 rounded-xl border-2 border-dashed border-muted/30 flex items-center justify-center cursor-pointer text-muted"
      >
        <Camera size={24} />
      </button>

      {fileIds.map((id, i) => (
        <div key={id} className="relative h-20 w-20">
          <img
            src={photoUrl(id)}
            alt=""
            className="w-20 h-20 rounded-xl object-cover cursor-pointer"
            onClick={() => setViewerIndex(i)}
          />
          <button
            type="button"
            aria-label="ลบรูป"
            onClick={() => setConfirmId(id)}
            className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-danger text-white flex items-center justify-center cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {Array.from({ length: uploadingCount }).map((_, i) => (
        <Skeleton key={`uploading-${i}`} className="h-20 w-20" />
      ))}

      {viewerIndex !== null && (
        <PhotoViewer fileIds={fileIds} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}

      {confirmId && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6">
          <div className="w-full max-w-xs rounded-2xl bg-surface shadow-card p-5 flex flex-col items-center gap-4">
            <p className="text-base font-semibold text-danger">ลบรูปนี้?</p>
            <p className="text-sm text-muted text-center">ลบแล้วกู้คืนไม่ได้</p>
            <div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="flex-1 h-11 rounded-xl bg-muted/10 text-text font-medium cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmRemove}
                className="flex-1 h-11 rounded-xl bg-danger text-white font-semibold cursor-pointer"
              >
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
